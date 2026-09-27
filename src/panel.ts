import type { Block, BlockResponse, ButtonElement } from "@emdash-cms/blocks";
import type { PluginContext, PluginUiContext } from "emdash/plugin";

import { uiFor, type Ui } from "./i18n.js";
import { SegmentMismatchError } from "./portable-text.js";
import {
	applyTranslations,
	collectSegments,
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
	 * and not yet published; `translated` = published, so machine translation no longer touches it.
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

export type Entry = { collection: string; id: string; locale: string | null };

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

/** The site's default language; translations are always made from it. */
export async function resolveSourceLocale(ctx: PluginContext): Promise<string> {
	return ctx.site.locale.toLowerCase();
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

type Accessory = NonNullable<Extract<Block, { type: "section" }>["accessory"]>;

/**
 * One line per target language with its status, which follows from the content itself: missing,
 * draft, done once published, outdated once the source changes after that. A button appears only
 * when LinguaDash can do the next step: create the translation, or machine translate it again.
 */
function render(state: State, entry: Entry, ui: Ui): Block[] {
	const { m } = ui;
	if (state.translatable.length === 0) return [{ type: "context", text: m.noTranslatableFields }];
	const blocks: Block[] = [];
	if (!state.source) {
		blocks.push({ type: "banner", variant: "alert", description: m.noSource(ui.language(state.sourceLocale)) });
	}
	const button = (
		action_id: string,
		label: string,
		locale: string,
		style: "primary" | "danger" | "secondary",
	): ButtonElement => ({ type: "button", action_id, label, value: locale, style });
	for (const locale of state.locales) {
		if (locale === state.sourceLocale) continue;
		const row = state.byLocale.get(locale);
		const current = row?.id === entry.id;
		const name = current ? `${ui.label(locale)} (${m.thisEntry})` : ui.label(locale);
		const machine = canMachineTranslate(state, entry.collection, locale);
		let label: string;
		let accessory: Accessory | undefined;
		if (!row) {
			label = m.missing;
			if (machine) accessory = button("machine", m.translate, locale, "primary");
			else if (state.source) accessory = button("create", m.createTranslation, locale, "primary");
		} else {
			const status = state.statuses.get(statusId(entry.collection, row.id));
			if (status && state.sourceHash !== null && status.sourceHash !== state.sourceHash) {
				label = m.outdated;
				if (machine) {
					accessory = {
						...button("machine", m.retranslate, locale, "danger"),
						confirm: {
							title: m.retranslateTitle(ui.language(locale)),
							text: m.retranslateText,
							confirm: m.retranslate,
							deny: m.cancel,
							style: "danger",
						},
					};
				}
			} else if (row.status === "published") {
				label = m.done;
			} else {
				label = m.draft;
				if (machine && status?.state === "copied") accessory = button("machine", m.translate, locale, "primary");
			}
		}
		blocks.push({ type: "section", text: `${name} · ${label}`, ...(accessory && { accessory }) });
	}
	if (state.targetLocales.length === 0) blocks.push({ type: "context", text: m.noTargets });
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

/** Publishing a translation marks it done, and up to date with the source as it is now. */
export async function markPublished(ctx: PluginContext, collection: string, id: string, locale: string) {
	const entry = { collection, id, locale };
	const state = await loadState(ctx, entry);
	if (!state.source || locale === state.sourceLocale || !state.targetLocales.includes(locale)) return;
	const status = state.statuses.get(statusId(collection, id));
	if (status?.state === "translated" && status.sourceHash === state.sourceHash) return;
	await markTranslated(ctx, state, entry, locale);
}

export function failureMessage({ m }: Ui, error: unknown): string {
	if (error instanceof ProviderError) return m.providerFailed(error.message);
	if (error instanceof SegmentMismatchError) return m.formatChanged;
	return m.actionFailed;
}

/**
 * Adds the translation for one locale an entry has no row in yet: machine translated when a
 * provider is set up, otherwise a copy of the source. Returns null when there is nothing to add.
 */
export async function addTranslation(
	ctx: PluginContext,
	entry: Entry,
	locale: string,
): Promise<"machine" | "created" | null> {
	const state = await loadState(ctx, entry);
	if (state.byLocale.has(locale) || !state.source || !state.targetLocales.includes(locale)) return null;
	if (canMachineTranslate(state, entry.collection, locale)) {
		await machineTranslate(ctx, state, entry, locale);
		return "machine";
	}
	await createTranslation(ctx, state, entry, locale);
	return "created";
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
	const text = uiFor(ui.locale);
	const { m } = text;
	let state = await loadState(ctx, entry);
	const request = readAction(input);
	if (!request) return { blocks: render(state, entry, text) };

	const { action, locale } = request;
	const exists = state.byLocale.has(locale);
	try {
		if (action === "create" && !exists && state.source && state.targetLocales.includes(locale)) {
			await createTranslation(ctx, state, entry, locale);
			state = await loadState(ctx, entry);
			return {
				blocks: render(state, entry, text),
				toast: { type: "success", message: m.created(text.language(locale)) },
			};
		}
		if (action === "machine" && canMachineTranslate(state, entry.collection, locale)) {
			await machineTranslate(ctx, state, entry, locale);
			state = await loadState(ctx, entry);
			return {
				blocks: render(state, entry, text),
				toast: { type: "success", message: m.machineDone(text.language(locale)) },
			};
		}
	} catch (error) {
		ctx.log.error("translation action failed", { action, locale, error: String(error) });
		return { blocks: render(state, entry, text), toast: { type: "error", message: failureMessage(text, error) } };
	}
	return { blocks: render(state, entry, text), toast: { type: "info", message: m.nothingToDo } };
}
