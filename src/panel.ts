import type { Block, BlockResponse } from "@emdash-cms/blocks";
import type { PluginContext, PluginUiContext } from "emdash/plugin";

type ContentAccess = NonNullable<PluginContext["content"]>;
type WritableContent = ContentAccess &
	Required<Pick<ContentAccess, "create" | "getTranslations" | "getRevision">>;
type TranslationSummary = Awaited<ReturnType<WritableContent["getTranslations"]>>["translations"][number];

/** Stored per translated entry, keyed by `statusId(collection, entryId)`. */
export interface TranslationStatus {
	collection: string;
	targetId: string;
	targetLocale: string;
	sourceId: string;
	/** `copied` = created from the source and not yet translated; `translated` = marked done. */
	state: "copied" | "translated";
	/** Fingerprint of the source's translatable fields when the state was recorded. */
	sourceHash: string;
	updatedAt: string;
}

type Entry = { collection: string; id: string; locale: string | null };

export function statusId(collection: string, entryId: string): string {
	return `${collection}:${entryId}`;
}

export function parseLocales(value: unknown): string[] {
	if (typeof value !== "string") return [];
	const locales = value
		.split(/[\s,]+/)
		.map((locale) => locale.trim().toLowerCase())
		.filter(Boolean);
	return [...new Set(locales)];
}

async function fingerprint(fields: readonly string[], data: Record<string, unknown>) {
	const payload = JSON.stringify(fields.map((field) => [field, data[field] ?? null]));
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
	return [...new Uint8Array(digest).slice(0, 12)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function writableContent(ctx: PluginContext): WritableContent {
	const content = ctx.content;
	if (!content?.create || !content.getTranslations || !content.getRevision) {
		throw new Error("LinguaDash needs the content:write and content:revisions:read capabilities");
	}
	return content as WritableContent;
}

/** The entry with its unpublished draft revision applied, i.e. what an editor last saved. */
async function latest(content: WritableContent, collection: string, id: string) {
	const item = await content.get(collection, id);
	if (!item?.draftRevisionId) return item;
	const draft = await content.getRevision(collection, id, item.draftRevisionId);
	return draft ? { ...item, data: { ...item.data, ...draft.data } } : item;
}

async function loadState(ctx: PluginContext, entry: Entry) {
	const content = writableContent(ctx);
	const [sourceSetting, targetSetting, group, schema] = await Promise.all([
		ctx.settings.get<string>("sourceLocale"),
		ctx.settings.get<string>("targetLocales"),
		content.getTranslations(entry.collection, entry.id),
		ctx.schema?.getCollection(entry.collection),
	]);
	const sourceLocale = parseLocales(sourceSetting)[0] ?? ctx.site.locale;
	const targetLocales = parseLocales(targetSetting).filter((locale) => locale !== sourceLocale);
	const byLocale = new Map<string, TranslationSummary>();
	for (const row of group.translations) if (row.locale) byLocale.set(row.locale, row);

	const translatable = (schema?.fields ?? []).filter((f) => f.translatable).map((f) => f.slug);
	const sourceRow = byLocale.get(sourceLocale);
	const source = sourceRow ? await latest(content, entry.collection, sourceRow.id) : null;
	const sourceHash = source ? await fingerprint(translatable, source.data) : null;

	const targetIds = group.translations
		.filter((row) => row.locale !== sourceLocale)
		.map((row) => statusId(entry.collection, row.id));
	const statuses = (await ctx.storage.status!.getMany(targetIds)) as Map<string, TranslationStatus>;

	const locales = [
		...new Set([sourceLocale, ...targetLocales, ...byLocale.keys()]),
	];
	return { content, sourceLocale, targetLocales, byLocale, translatable, source, sourceHash, statuses, locales };
}

type State = Awaited<ReturnType<typeof loadState>>;

function describe(state: State, collection: string, locale: string, row: TranslationSummary | undefined) {
	if (locale === state.sourceLocale) return row ? `Source · ${row.status}` : "Source · missing";
	if (!row) return "Not translated";
	const status = state.statuses.get(statusId(collection, row.id));
	const outdated = status && state.sourceHash !== null && status.sourceHash !== state.sourceHash;
	const progress =
		status?.state === "translated" ? "Translated" : status?.state === "copied" ? "Needs translation" : "Not reviewed";
	return `${row.status} · ${outdated ? "Outdated: source changed" : progress}`;
}

function render(state: State, entry: Entry): Block[] {
	const blocks: Block[] = [];
	if (!state.source) {
		blocks.push({
			type: "banner",
			variant: "alert",
			description: `This entry has no ${state.sourceLocale.toUpperCase()} version to translate from.`,
		});
	}
	for (const locale of state.locales) {
		const row = state.byLocale.get(locale);
		const current = row?.id === entry.id;
		blocks.push({
			type: "section",
			text: `${locale.toUpperCase()}${current ? " (this entry)" : ""} — ${describe(state, entry.collection, locale, row)}`,
		});
		const elements: Extract<Block, { type: "actions" }>["elements"] = [];
		if (row && !current) {
			elements.push({
				type: "link",
				label: "Open",
				target: { kind: "content", collection: entry.collection, id: row.id, locale },
			});
		}
		if (!row && state.source && state.targetLocales.includes(locale)) {
			elements.push({ type: "button", action_id: "create", label: "Create translation", value: locale });
		}
		if (row && locale !== state.sourceLocale && state.source) {
			const status = state.statuses.get(statusId(entry.collection, row.id));
			if (status?.state !== "translated" || status.sourceHash !== state.sourceHash) {
				elements.push({ type: "button", action_id: "mark-translated", label: "Mark as translated", value: locale });
			}
		}
		if (elements.length > 0) blocks.push({ type: "actions", elements });
	}
	if (state.targetLocales.length === 0) {
		blocks.push({ type: "context", text: "No target languages configured yet." });
	}
	blocks.push({
		type: "actions",
		elements: [{ type: "link", label: "Language settings", target: { kind: "plugin-settings" } }],
	});
	return blocks;
}

async function createTranslation(ctx: PluginContext, state: State, entry: Entry, locale: string) {
	const source = state.source!;
	const data: Record<string, unknown> = {};
	for (const field of state.translatable) {
		if (source.data[field] !== undefined) data[field] = source.data[field];
	}
	const created = await state.content.create(entry.collection, data, {
		locale,
		translationOf: source.id,
	});
	const status: TranslationStatus = {
		collection: entry.collection,
		targetId: created.id,
		targetLocale: locale,
		sourceId: source.id,
		state: "copied",
		sourceHash: state.sourceHash!,
		updatedAt: new Date().toISOString(),
	};
	await ctx.storage.status!.put(statusId(entry.collection, created.id), status);
}

async function markTranslated(ctx: PluginContext, state: State, entry: Entry, locale: string) {
	const row = state.byLocale.get(locale)!;
	const status: TranslationStatus = {
		collection: entry.collection,
		targetId: row.id,
		targetLocale: locale,
		sourceId: state.source!.id,
		state: "translated",
		sourceHash: state.sourceHash!,
		updatedAt: new Date().toISOString(),
	};
	await ctx.storage.status!.put(statusId(entry.collection, row.id), status);
}

function readAction(input: unknown): { action: string; locale: string } | null {
	if (typeof input !== "object" || input === null) return null;
	const { type, action_id, value } = input as Record<string, unknown>;
	if (type !== "block_action" || typeof action_id !== "string" || typeof value !== "string") return null;
	return { action: action_id, locale: value };
}

export async function handlePanel(
	input: unknown,
	ui: PluginUiContext | undefined,
	ctx: PluginContext,
): Promise<BlockResponse> {
	if (ui?.surface !== "content-editor-panel") return { blocks: [] };
	const entry = ui.entry;
	let state = await loadState(ctx, entry);
	const request = readAction(input);
	if (!request) return { blocks: render(state, entry) };

	const { action, locale } = request;
	const exists = state.byLocale.has(locale);
	try {
		if (action === "create" && !exists && state.source && state.targetLocales.includes(locale)) {
			await createTranslation(ctx, state, entry, locale);
			state = await loadState(ctx, entry);
			return {
				blocks: render(state, entry),
				toast: { type: "success", message: `${locale.toUpperCase()} draft created from the source` },
			};
		}
		if (action === "mark-translated" && exists && locale !== state.sourceLocale && state.source) {
			await markTranslated(ctx, state, entry, locale);
			state = await loadState(ctx, entry);
			return {
				blocks: render(state, entry),
				toast: { type: "success", message: `${locale.toUpperCase()} marked as translated` },
			};
		}
	} catch (error) {
		ctx.log.error("translation action failed", { action, locale, error: String(error) });
		return {
			blocks: render(state, entry),
			toast: { type: "error", message: "The translation could not be updated. Try again." },
		};
	}
	return { blocks: render(state, entry), toast: { type: "info", message: "Nothing to do" } };
}
