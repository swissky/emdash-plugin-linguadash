import type { Block, BlockResponse, ButtonElement, LinkElement, MenuElement } from "@emdash-cms/blocks";
import type {
	ContentDeleteEvent,
	ContentHookEvent,
	ContentPublishStateChangeEvent,
	PluginContext,
} from "emdash/plugin";

import {
	addTranslation,
	entryTitle,
	failureMessage,
	fingerprint,
	markPublished,
	resolveSourceLocale,
	resolveTargetLocales,
	statusId,
	translatableFields,
	type TranslationStatus,
} from "./panel.js";
import type { Ui } from "./i18n.js";
import { PROVIDER_NAMES } from "./translate.js";
import { providerSummary, settingsBlocks, setupStatus, type RejectedForm, type SetupStatus } from "./settings.js";

type Toast = NonNullable<BlockResponse["toast"]>;
type CollectionSchema = Awaited<ReturnType<NonNullable<PluginContext["schema"]>["listCollections"]>>[number];

const LIST_LIMIT = 25;
export const TRANSLATE_ACTION = "translate-missing";
const ALL_LOCALES = "*";
const SCAN_LIMIT = 100;

type SavedEntry = {
	id?: unknown;
	slug?: unknown;
	locale?: unknown;
	data?: unknown;
	seo?: { title?: string | null; description?: string | null };
};

/**
 * Keeps stored statuses in step with saves: a source save flags or clears `outdated` on its
 * translations, a translation save refreshes the title shown in listings.
 */
export async function trackSave(event: ContentHookEvent, ctx: PluginContext): Promise<void> {
	const saved = event.content as SavedEntry;
	const statuses = ctx.storage.status;
	if (typeof saved.id !== "string" || !statuses) return;
	const data = (typeof saved.data === "object" && saved.data !== null ? saved.data : {}) as Record<string, unknown>;

	if (saved.locale === (await resolveSourceLocale(ctx))) {
		const { items } = await statuses.query({ where: { sourceId: saved.id }, limit: 100 });
		if (items.length === 0) return;
		const schema = await ctx.schema?.getCollection(event.collection);
		const hash = await fingerprint(translatableFields(schema), data, saved.seo);
		const changed = (items as { id: string; data: TranslationStatus }[])
			.filter(({ data: status }) => (status.sourceHash !== hash) !== Boolean(status.outdated))
			.map(({ id, data: status }) => ({ id, data: { ...status, outdated: status.sourceHash !== hash } }));
		if (changed.length > 0) await statuses.putMany(changed);
		return;
	}

	const key = statusId(event.collection, saved.id);
	const status = (await statuses.get(key)) as TranslationStatus | null;
	if (!status) return;
	const schema = await ctx.schema?.getCollection(event.collection);
	const title = entryTitle(data, typeof saved.slug === "string" ? saved.slug : saved.id, schema?.titleField);
	if (status.title !== title) await statuses.put(key, { ...status, title });
}

export async function trackPublish(event: ContentPublishStateChangeEvent, ctx: PluginContext): Promise<void> {
	const { id, locale } = event.content;
	if (typeof id === "string" && typeof locale === "string") await markPublished(ctx, event.collection, id, locale);
}

export async function forgetDeleted(event: ContentDeleteEvent, ctx: PluginContext): Promise<void> {
	await ctx.storage.status?.delete(statusId(event.collection, event.id));
}

interface WorkItem {
	title: string;
	collection: string;
	id: string;
	locale: string;
	/** Locale codes shown after the title, e.g. the target or the missing languages. */
	locales: string[];
}

const entryKey = (item: WorkItem) => `${item.collection}|${item.id}`;

type RowAction = ButtonElement | LinkElement | MenuElement;

/** One language is added right away; several open a menu with each language and all of them. */
function translateAction(ui: Ui, label: string) {
	return (item: WorkItem): RowAction => {
		const value = (locale: string) => `${locale}|${entryKey(item)}`;
		if (item.locales.length === 1) {
			return { type: "button", action_id: TRANSLATE_ACTION, label, value: value(item.locales[0]!) };
		}
		return {
			type: "menu",
			action_id: TRANSLATE_ACTION,
			label,
			items: [
				...item.locales.map((locale) => ({ label: ui.language(locale), value: value(locale) })),
				{ label: ui.m.allLanguages, value: value(ALL_LOCALES) },
			],
		};
	};
}

function openAction(ui: Ui) {
	return (item: WorkItem): RowAction => ({
		type: "link",
		label: ui.m.open,
		target: { kind: "content", collection: item.collection, id: item.id, locale: item.locale },
	});
}

interface Panel {
	label: string;
	blocks: Block[];
}

function workList(
	ui: Ui,
	tab: { label: string; hint: string; empty: string; languages: string },
	items: WorkItem[],
	action: (item: WorkItem) => RowAction,
	note?: string,
): Panel {
	return {
		label: tab.label,
		blocks: [
			{ type: "context", text: tab.hint },
			items.length === 0
				? { type: "empty", title: tab.empty, size: "sm" }
				: {
						type: "table",
						page_action_id: "page",
						columns: [
							{ key: "title", label: ui.m.columnEntry },
							{ key: "languages", label: tab.languages },
							{ key: "action", label: "", format: "element" },
						],
						rows: items.map((item) => ({
							title: item.title,
							languages: ui.languages(item.locales),
							action: action(item),
						})),
					},
			...(note ? [{ type: "context", text: note } as const] : []),
		],
	};
}

function fromStatuses(ui: Ui, page: { items: unknown[]; hasMore: boolean }) {
	const items = (page.items as { data: TranslationStatus }[]).map(({ data: status }) => ({
		title: status.title,
		collection: status.collection,
		id: status.targetId,
		locale: status.targetLocale,
		locales: [status.targetLocale],
	}));
	return { items, note: page.hasMore ? ui.m.showingFirst(LIST_LIMIT) : undefined };
}

/**
 * Source entries lacking a row in one or more target locales, and target rows LinguaDash has no
 * status for (created in the admin, over the API or by an import). Reads one page of `SCAN_LIMIT`
 * rows per collection that has translatable fields, so on larger collections only part of the
 * content is checked.
 */
async function scanContent(
	ctx: PluginContext,
	schemas: CollectionSchema[],
	sourceLocale: string,
	targetLocales: string[],
) {
	const missing: WorkItem[] = [];
	const targets: WorkItem[] = [];
	let partial = false;
	if (targetLocales.length === 0) return { missing, untracked: targets, partial };
	const collections = schemas.filter((c) => c.fields.some((f) => f.translatable));
	const pages = await Promise.all(collections.map((c) => ctx.content!.list(c.slug, { limit: SCAN_LIMIT })));
	collections.forEach((collection, index) => {
		const page = pages[index]!;
		if (page.hasMore) partial = true;
		type Item = (typeof page.items)[number];
		const groups = new Map<string, { source?: Item; locales: Set<string>; targets: Item[] }>();
		for (const item of page.items) {
			const key = item.translationGroup ?? item.id;
			const group = groups.get(key) ?? { locales: new Set<string>(), targets: [] };
			if (item.locale) group.locales.add(item.locale);
			if (item.locale === sourceLocale) group.source = item;
			else if (item.locale && targetLocales.includes(item.locale)) group.targets.push(item);
			groups.set(key, group);
		}
		for (const { source, locales, targets: rows } of groups.values()) {
			if (!source) continue;
			for (const row of rows) {
				targets.push({
					title: entryTitle(row.data, row.slug ?? row.id, collection.titleField),
					collection: collection.slug,
					id: row.id,
					locale: row.locale!,
					locales: [row.locale!],
				});
			}
			const absent = targetLocales.filter((locale) => !locales.has(locale));
			if (absent.length === 0) continue;
			missing.push({
				title: entryTitle(source.data, source.slug ?? source.id, collection.titleField),
				collection: collection.slug,
				id: source.id,
				locale: sourceLocale,
				locales: absent,
			});
		}
	});
	const known = await ctx.storage.status!.getMany(targets.map((item) => statusId(item.collection, item.id)));
	const untracked = targets.filter((item) => !known.has(statusId(item.collection, item.id)));
	return { missing, untracked, partial };
}

function openSettings(ui: Ui): Block {
	return {
		type: "actions",
		elements: [{ type: "button", action_id: "open-settings", label: ui.m.openSettings, value: "settings" }],
	};
}

function onboarding(status: SetupStatus, ui: Ui, admin: boolean): Block[] {
	const { m } = ui;
	const step = (done: boolean, title: string, detail: string): Block => ({
		type: "section",
		text: `${done ? "✓" : "○"} ${title} — ${detail}`,
	});
	const languages = status.targetLocales.length > 0;
	const fields = status.translatableCollections.length > 0;
	return [
		{ type: "header", text: m.setupTitle },
		{ type: "context", text: m.setupIntro },
		step(
			languages,
			m.stepLanguages,
			languages
				? m.languagesDone(ui.language(status.sourceLocale), ui.languages(status.targetLocales))
				: m.languagesTodo,
		),
		step(fields, m.stepFields, fields ? m.fieldsDone(status.translatableCollections.join(", ")) : m.fieldsTodo),
		step(
			status.providerReady,
			m.stepMachine,
			status.provider === "none" ? m.machineOffHint : providerSummary(status, ui),
		),
		...(admin ? [openSettings(ui)] : []),
	];
}

/** Content above the tabs, the overview's tab panels, and the tab to open first. */
async function overview(
	ctx: PluginContext,
	ui: Ui,
	status: SetupStatus,
	admin: boolean,
): Promise<{ intro: Block[]; panels: Panel[]; first: number }> {
	const { m } = ui;
	if (status.targetLocales.length === 0 || status.translatableCollections.length === 0) {
		return { intro: [], panels: [{ label: m.tabOverview, blocks: onboarding(status, ui, admin) }], first: 0 };
	}
	const { sourceLocale, targetLocales } = status;
	const statuses = ctx.storage.status!;
	const [outdatedCount, storedPendingCount, outdated, pending] = await Promise.all([
		statuses.count({ outdated: true }),
		statuses.count({ state: { in: ["copied", "machine"] }, outdated: false }),
		statuses.query({ where: { outdated: true }, limit: LIST_LIMIT }),
		statuses.query({
			where: { state: { in: ["copied", "machine"] }, outdated: false },
			limit: LIST_LIMIT,
		}),
	]);
	const schemas = (await ctx.schema?.listCollections()) ?? [];
	const translateLabel =
		status.providerReady && status.provider !== "none"
			? m.translateWith(PROVIDER_NAMES[status.provider])
			: m.createTranslation;
	const { missing, untracked, partial } = await scanContent(ctx, schemas, sourceLocale, targetLocales);
	const missingCount = missing.reduce((sum, item) => sum + item.locales.length, 0);
	const outdatedList = fromStatuses(ui, outdated);
	const stored = fromStatuses(ui, pending);
	const pendingItems = [...untracked, ...stored.items];
	const pendingCount = storedPendingCount + untracked.length;
	const pendingList = {
		items: pendingItems.slice(0, LIST_LIMIT),
		note: pendingItems.length > LIST_LIMIT || stored.note ? m.showingFirst(LIST_LIMIT) : undefined,
	};

	const scanNote = partial ? m.partialScan(SCAN_LIMIT) : undefined;
	const join = (...notes: (string | undefined)[]) => notes.filter(Boolean).join(" ") || undefined;

	const intro: Block[] = [
		{
			type: "context",
			text: m.summary(ui.language(sourceLocale), ui.languages(targetLocales), providerSummary(status, ui)),
		},
		...(admin && status.provider !== "none" && !status.providerReady ? [openSettings(ui)] : []),
	];
	const tab = (label: string, hint: string, empty: string, languages = m.columnLanguage) => ({
		label,
		hint,
		empty,
		languages,
	});
	const panels = [
		workList(
			ui,
			tab(m.tabMissing(missingCount), m.missingHint, m.noneMissing, m.columnMissing),
			missing.slice(0, LIST_LIMIT),
			translateAction(ui, translateLabel),
			join(missing.length > LIST_LIMIT ? m.showingFirst(LIST_LIMIT) : undefined, scanNote),
		),
		workList(
			ui,
			tab(m.tabOutdated(outdatedCount), m.outdatedHint, m.noneOutdated),
			outdatedList.items,
			openAction(ui),
			outdatedList.note,
		),
		workList(
			ui,
			tab(m.tabReview(pendingCount), m.reviewHint, m.noneReview),
			pendingList.items,
			openAction(ui),
			join(pendingList.note, scanNote),
		),
	];
	const open = [missingCount, outdatedCount, pendingCount].findIndex((count) => count > 0);
	return { intro, panels, first: Math.max(open, 0) };
}

/** Handles a pick from a missing-languages menu and reports the outcome as a toast. */
export async function translateMissing(ctx: PluginContext, ui: Ui, value: unknown): Promise<Toast> {
	const [locale, collection, id] = typeof value === "string" ? value.split("|") : [];
	if (!locale || !collection || !id) return { type: "info", message: ui.m.nothingToDo };
	const sourceLocale = await resolveSourceLocale(ctx);
	const locales = locale === ALL_LOCALES ? await resolveTargetLocales(ctx, sourceLocale) : [locale];
	const entry = { collection, id, locale: sourceLocale };
	const outcomes = await Promise.allSettled(locales.map((target) => addTranslation(ctx, entry, target)));
	const failed = outcomes.find((outcome) => outcome.status === "rejected");
	if (failed) {
		ctx.log.error("translation from the overview failed", { collection, id, locale, error: String(failed.reason) });
		return { type: "error", message: failureMessage(ui, failed.reason) };
	}
	const done = outcomes.flatMap((outcome, index) =>
		outcome.status === "fulfilled" && outcome.value ? [{ locale: locales[index]!, result: outcome.value }] : [],
	);
	if (done.length === 0) return { type: "info", message: ui.m.nothingToDo };
	const machine = done.some((item) => item.result === "machine");
	if (done.length > 1) {
		return { type: "success", message: machine ? ui.m.machineDoneMany(done.length) : ui.m.createdMany(done.length) };
	}
	const language = ui.language(done[0]!.locale);
	return { type: "success", message: machine ? ui.m.machineDone(language) : ui.m.created(language) };
}

/** The Translations page: one tab per kind of open work, plus a settings tab for administrators. */
export async function renderPage(
	ctx: PluginContext,
	ui: Ui,
	options: { admin: boolean; tab?: "overview" | "settings"; rejected?: RejectedForm },
): Promise<BlockResponse> {
	const status = await setupStatus(ctx);
	const { intro, panels, first } = await overview(ctx, ui, status, options.admin);
	if (options.admin) {
		panels.push({ label: ui.m.tabSettings, blocks: await settingsBlocks(ctx, ui, status, options.rejected) });
	}
	if (panels.length === 1) return { blocks: [...intro, ...panels[0]!.blocks] };
	const settingsTab = options.admin && options.tab === "settings";
	return {
		blocks: [...intro, { type: "tab", panels, default_tab: settingsTab ? panels.length - 1 : first }],
	};
}
