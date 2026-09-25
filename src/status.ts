import type { Block, BlockResponse } from "@emdash-cms/blocks";
import type { ContentDeleteEvent, ContentHookEvent, PluginContext } from "emdash/plugin";

import {
	entryTitle,
	fingerprint,
	resolveSourceLocale,
	resolveTargetLocales,
	statusId,
	translatableFields,
	type TranslationStatus,
} from "./panel.js";

const LIST_LIMIT = 25;
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

export async function forgetDeleted(event: ContentDeleteEvent, ctx: PluginContext): Promise<void> {
	await ctx.storage.status?.delete(statusId(event.collection, event.id));
}

interface WorkItem {
	title: string;
	collection: string;
	id: string;
	locale: string;
	/** Locale codes shown after the collection, e.g. the target or the missing languages. */
	locales: string[];
}

function workList(heading: string, items: WorkItem[], note?: string): Block[] {
	if (items.length === 0) return [];
	const blocks: Block[] = [{ type: "header", text: heading }];
	for (const item of items) {
		blocks.push({
			type: "section",
			text: `${item.title} — ${item.collection} · ${item.locales.map((l) => l.toUpperCase()).join(", ")}`,
		});
		blocks.push({
			type: "actions",
			elements: [
				{
					type: "link",
					label: "Open",
					target: { kind: "content", collection: item.collection, id: item.id, locale: item.locale },
				},
			],
		});
	}
	if (note) blocks.push({ type: "context", text: note });
	return blocks;
}

function fromStatuses(page: { items: unknown[]; hasMore: boolean }) {
	const items = (page.items as { data: TranslationStatus }[]).map(({ data: status }) => ({
		title: status.title,
		collection: status.collection,
		id: status.targetId,
		locale: status.targetLocale,
		locales: [status.targetLocale],
	}));
	return { items, note: page.hasMore ? `Showing the first ${LIST_LIMIT}.` : undefined };
}

/**
 * Source entries lacking a row in one or more target locales. Reads one page of
 * `SCAN_LIMIT` rows per collection that has translatable fields, so on larger
 * collections only part of the content is checked.
 */
async function findMissing(ctx: PluginContext, sourceLocale: string, targetLocales: string[]) {
	const missing: WorkItem[] = [];
	let partial = false;
	if (targetLocales.length === 0 || !ctx.schema) return { missing, partial };
	const collections = (await ctx.schema.listCollections()).filter((c) => c.fields.some((f) => f.translatable));
	const pages = await Promise.all(collections.map((c) => ctx.content!.list(c.slug, { limit: SCAN_LIMIT })));
	collections.forEach((collection, index) => {
		const page = pages[index]!;
		if (page.hasMore) partial = true;
		const groups = new Map<string, { source?: (typeof page.items)[number]; locales: Set<string> }>();
		for (const item of page.items) {
			const key = item.translationGroup ?? item.id;
			const group = groups.get(key) ?? { locales: new Set<string>() };
			if (item.locale) group.locales.add(item.locale);
			if (item.locale === sourceLocale) group.source = item;
			groups.set(key, group);
		}
		for (const { source, locales } of groups.values()) {
			if (!source) continue;
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
	return { missing, partial };
}

export async function handleOverview(ctx: PluginContext): Promise<BlockResponse> {
	const statuses = ctx.storage.status!;
	const sourceLocale = await resolveSourceLocale(ctx);
	const [targetLocales, outdatedCount, pendingCount, doneCount, outdated, pending] = await Promise.all([
		resolveTargetLocales(ctx, sourceLocale),
		statuses.count({ outdated: true }),
		statuses.count({ state: { in: ["copied", "machine"] }, outdated: false }),
		statuses.count({ state: "translated", outdated: false }),
		statuses.query({ where: { outdated: true }, limit: LIST_LIMIT }),
		statuses.query({ where: { state: { in: ["copied", "machine"] }, outdated: false }, limit: LIST_LIMIT }),
	]);
	const { missing, partial } = await findMissing(ctx, sourceLocale, targetLocales);
	const missingCount = missing.reduce((sum, item) => sum + item.locales.length, 0);
	const outdatedList = fromStatuses(outdated);
	const pendingList = fromStatuses(pending);

	const blocks: Block[] = [
		{
			type: "stats",
			items: [
				{ label: "Not translated", value: missingCount, description: "Languages without an entry" },
				{ label: "Outdated", value: outdatedCount, description: "Source changed since translation" },
				{ label: "Needs translation", value: pendingCount, description: "Copied or machine translated, not reviewed" },
				{ label: "Up to date", value: doneCount },
			],
		},
		...workList(
			"Not translated",
			missing.slice(0, LIST_LIMIT),
			[
				missing.length > LIST_LIMIT ? `Showing the first ${LIST_LIMIT}.` : "",
				partial ? `Only the first ${SCAN_LIMIT} entries of each collection were checked.` : "",
			]
				.filter(Boolean)
				.join(" ") || undefined,
		),
		...workList("Outdated", outdatedList.items, outdatedList.note),
		...workList("Needs translation", pendingList.items, pendingList.note),
	];
	if (targetLocales.length === 0) {
		blocks.push({
			type: "actions",
			elements: [{ type: "link", label: "Choose target languages", target: { kind: "plugin-settings" } }],
		});
	} else if (missingCount + outdatedCount + pendingCount === 0) {
		blocks.push({ type: "context", text: "Every entry is translated and up to date." });
	}
	return { blocks };
}
