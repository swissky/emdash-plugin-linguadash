import type { Block, BlockResponse } from "@emdash-cms/blocks";
import type { PluginContext, PluginUiContext } from "emdash/plugin";

import { SegmentMismatchError } from "./portable-text.js";
import {
	applyTranslations,
	collectSegments,
	PROVIDER_NAMES,
	ProviderError,
	readProviderConfig,
	type SeoText,
	translateSegments,
} from "./translate.js";

type ContentAccess = NonNullable<PluginContext["content"]>;
type WritableContent = ContentAccess &
	Required<Pick<ContentAccess, "create" | "update" | "getTranslations" | "getRevision">>;
type TranslationSummary = Awaited<ReturnType<WritableContent["getTranslations"]>>["translations"][number];

/** Stored per translated entry, keyed by `statusId(collection, entryId)`. */
export interface TranslationStatus {
	collection: string;
	targetId: string;
	targetLocale: string;
	sourceId: string;
	/**
	 * `copied` = created from the source and not yet translated; `machine` = machine translated
	 * and not yet reviewed; `translated` = marked done.
	 */
	state: "copied" | "machine" | "translated";
	/** Fingerprint of the source's translatable fields when the state was recorded. */
	sourceHash: string;
	/** Set by the save hook when the source's translatable fields no longer match `sourceHash`. */
	outdated: boolean;
	/** Target entry title as last saved, for listings that cannot load every entry. */
	title: string;
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

export function entryTitle(data: Record<string, unknown>, fallback: string, titleField?: string | null): string {
	const value = data[titleField ?? "title"];
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export async function resolveSourceLocale(ctx: PluginContext): Promise<string> {
	return parseLocales(await ctx.settings.get<string>("sourceLocale"))[0] ?? ctx.site.locale;
}

export async function resolveTargetLocales(ctx: PluginContext, sourceLocale: string): Promise<string[]> {
	return parseLocales(await ctx.settings.get<string>("targetLocales")).filter((locale) => locale !== sourceLocale);
}

export function translatableFields(schema: { fields: { slug: string; translatable?: boolean }[] } | null | undefined) {
	return (schema?.fields ?? []).filter((f) => f.translatable).map((f) => f.slug);
}

/** Hash of the translatable fields plus, when set, the SEO title and description. */
export async function fingerprint(fields: readonly string[], data: Record<string, unknown>, seo?: SeoText | null) {
	const entries: unknown[] = fields.map((field) => [field, data[field] ?? null]);
	if (seo?.title || seo?.description) entries.push(["seo", seo.title ?? null, seo.description ?? null]);
	const payload = JSON.stringify(entries);
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
	return [...new Uint8Array(digest).slice(0, 12)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function writableContent(ctx: PluginContext): WritableContent {
	const content = ctx.content;
	if (!content?.create || !content.update || !content.getTranslations || !content.getRevision) {
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
	const [sourceLocale, group, schema, provider] = await Promise.all([
		resolveSourceLocale(ctx),
		content.getTranslations(entry.collection, entry.id),
		ctx.schema?.getCollection(entry.collection),
		readProviderConfig(ctx),
	]);
	const targetLocales = await resolveTargetLocales(ctx, sourceLocale);
	const byLocale = new Map<string, TranslationSummary>();
	for (const row of group.translations) if (row.locale) byLocale.set(row.locale, row);

	const translatable = translatableFields(schema);
	const sourceRow = byLocale.get(sourceLocale);
	const source = sourceRow ? await latest(content, entry.collection, sourceRow.id) : null;
	const sourceHash = source ? await fingerprint(translatable, source.data, source.seo) : null;

	const targetIds = group.translations
		.filter((row) => row.locale !== sourceLocale)
		.map((row) => statusId(entry.collection, row.id));
	const statuses = (await ctx.storage.status!.getMany(targetIds)) as Map<string, TranslationStatus>;

	const locales = [
		...new Set([sourceLocale, ...targetLocales, ...byLocale.keys()]),
	];
	const titleField = schema?.titleField ?? null;
	const translatableSchema = (schema?.fields ?? []).filter((f) => f.translatable);
	return {
		content,
		sourceLocale,
		targetLocales,
		byLocale,
		translatable,
		translatableSchema,
		titleField,
		source,
		sourceHash,
		statuses,
		locales,
		provider,
	};
}

/** Machine translation may replace only rows it created or untouched copies, never reviewed work. */
function canMachineTranslate(state: State, collection: string, locale: string): boolean {
	if (!state.provider || !state.source || !state.targetLocales.includes(locale)) return false;
	const row = state.byLocale.get(locale);
	if (!row) return true;
	const status = state.statuses.get(statusId(collection, row.id));
	return status?.state === "copied" || status?.state === "machine";
}

type State = Awaited<ReturnType<typeof loadState>>;

function describe(state: State, collection: string, locale: string, row: TranslationSummary | undefined) {
	if (locale === state.sourceLocale) return row ? `Source · ${row.status}` : "Source · missing";
	if (!row) return "Not translated";
	const status = state.statuses.get(statusId(collection, row.id));
	const outdated = status && state.sourceHash !== null && status.sourceHash !== state.sourceHash;
	const progress =
		status?.state === "translated"
			? "Translated"
			: status?.state === "copied"
				? "Needs translation"
				: status?.state === "machine"
					? "Machine translated, needs review"
					: "Not reviewed";
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
		if (canMachineTranslate(state, entry.collection, locale)) {
			const name = PROVIDER_NAMES[state.provider!.provider];
			elements.push({
				type: "button",
				action_id: "machine",
				label: row ? `Retranslate with ${name}` : `Translate with ${name}`,
				value: locale,
				style: "primary",
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

/**
 * The source's translatable fields, plus its SEO panel without the canonical URL: a copied
 * canonical would point search engines from the translation back to the source.
 */
function translatableCopy(state: State) {
	const source = state.source!;
	const data: Record<string, unknown> = {};
	for (const field of state.translatable) {
		if (source.data[field] !== undefined) data[field] = source.data[field];
	}
	const seo = source.seo
		? {
				title: source.seo.title,
				description: source.seo.description,
				image: source.seo.image,
				noIndex: source.seo.noIndex,
			}
		: undefined;
	return { data, seo };
}

async function createTranslation(ctx: PluginContext, state: State, entry: Entry, locale: string) {
	const source = state.source!;
	const { data, seo } = translatableCopy(state);
	const created = await state.content.create(entry.collection, seo ? { ...data, seo } : data, {
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
		outdated: false,
		title: entryTitle(created.data, created.slug ?? created.id, state.titleField),
		updatedAt: new Date().toISOString(),
	};
	await ctx.storage.status!.put(statusId(entry.collection, created.id), status);
}

async function machineTranslate(ctx: PluginContext, state: State, entry: Entry, locale: string) {
	const source = state.source!;
	const copy = translatableCopy(state);
	const { segments, plans } = collectSegments(state.translatableSchema, copy.data, copy.seo);
	const translated = await translateSegments(ctx, state.provider!, segments, state.sourceLocale, locale);
	const { data, seo } = applyTranslations(plans, translated, copy.data, copy.seo);
	const input = copy.seo ? { ...data, seo: { ...copy.seo, ...seo } } : data;

	const row = state.byLocale.get(locale);
	const saved = row
		? await state.content.update(entry.collection, row.id, input)
		: await state.content.create(entry.collection, input, { locale, translationOf: source.id });
	const status: TranslationStatus = {
		collection: entry.collection,
		targetId: saved.id,
		targetLocale: locale,
		sourceId: source.id,
		state: "machine",
		sourceHash: state.sourceHash!,
		outdated: false,
		title: entryTitle(data, saved.slug ?? saved.id, state.titleField),
		updatedAt: new Date().toISOString(),
	};
	await ctx.storage.status!.put(statusId(entry.collection, saved.id), status);
}

async function markTranslated(ctx: PluginContext, state: State, entry: Entry, locale: string) {
	const row = state.byLocale.get(locale)!;
	const previous = state.statuses.get(statusId(entry.collection, row.id));
	const status: TranslationStatus = {
		collection: entry.collection,
		targetId: row.id,
		targetLocale: locale,
		sourceId: state.source!.id,
		state: "translated",
		sourceHash: state.sourceHash!,
		outdated: false,
		title: previous?.title ?? row.slug ?? row.id,
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
		if (action === "machine" && canMachineTranslate(state, entry.collection, locale)) {
			await machineTranslate(ctx, state, entry, locale);
			state = await loadState(ctx, entry);
			return {
				blocks: render(state, entry),
				toast: { type: "success", message: `${locale.toUpperCase()} machine translated. Review it before publishing.` },
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
		const message =
			error instanceof ProviderError
				? `${error.message}. Check the API key in the language settings.`
				: error instanceof SegmentMismatchError
					? "The translation service changed the formatting. Nothing was saved; try again."
					: "The translation could not be updated. Try again.";
		return { blocks: render(state, entry), toast: { type: "error", message } };
	}
	return { blocks: render(state, entry), toast: { type: "info", message: "Nothing to do" } };
}
