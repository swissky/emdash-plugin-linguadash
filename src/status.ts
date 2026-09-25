import type { Block, BlockResponse } from "@emdash-cms/blocks";
import type { ContentDeleteEvent, ContentHookEvent, PluginContext } from "emdash/plugin";

import {
	entryTitle,
	fingerprint,
	resolveSourceLocale,
	statusId,
	translatableFields,
	type TranslationStatus,
} from "./panel.js";

const LIST_LIMIT = 25;

type SavedEntry = { id?: unknown; slug?: unknown; locale?: unknown; data?: unknown };

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
		const hash = await fingerprint(translatableFields(schema), data);
		const changed = (items as { id: string; data: TranslationStatus }[])
			.filter(({ data: status }) => (status.sourceHash !== hash) !== Boolean(status.outdated))
			.map(({ id, data: status }) => ({ id, data: { ...status, outdated: status.sourceHash !== hash } }));
		if (changed.length > 0) await statuses.putMany(changed);
		return;
	}

	const key = statusId(event.collection, saved.id);
	const status = (await statuses.get(key)) as TranslationStatus | null;
	if (!status) return;
	const title = entryTitle(data, typeof saved.slug === "string" ? saved.slug : saved.id);
	if (status.title !== title) await statuses.put(key, { ...status, title });
}

export async function forgetDeleted(event: ContentDeleteEvent, ctx: PluginContext): Promise<void> {
	await ctx.storage.status?.delete(statusId(event.collection, event.id));
}

function workList(heading: string, items: { data: TranslationStatus }[], hasMore: boolean): Block[] {
	if (items.length === 0) return [];
	const blocks: Block[] = [{ type: "header", text: heading }];
	for (const { data: status } of items) {
		blocks.push({
			type: "section",
			text: `${status.title} — ${status.collection} · ${status.targetLocale.toUpperCase()}`,
		});
		blocks.push({
			type: "actions",
			elements: [
				{
					type: "link",
					label: "Open",
					target: { kind: "content", collection: status.collection, id: status.targetId, locale: status.targetLocale },
				},
			],
		});
	}
	if (hasMore) blocks.push({ type: "context", text: `Showing the first ${LIST_LIMIT}.` });
	return blocks;
}

export async function handleOverview(ctx: PluginContext): Promise<BlockResponse> {
	const statuses = ctx.storage.status!;
	const [outdatedCount, pendingCount, doneCount, outdated, pending] = await Promise.all([
		statuses.count({ outdated: true }),
		statuses.count({ state: "copied", outdated: false }),
		statuses.count({ state: "translated", outdated: false }),
		statuses.query({ where: { outdated: true }, limit: LIST_LIMIT }),
		statuses.query({ where: { state: "copied", outdated: false }, limit: LIST_LIMIT }),
	]);

	const blocks: Block[] = [
		{
			type: "stats",
			items: [
				{ label: "Outdated", value: outdatedCount, description: "Source changed since translation" },
				{ label: "Needs translation", value: pendingCount, description: "Copied from the source" },
				{ label: "Up to date", value: doneCount },
			],
		},
		...workList("Outdated", outdated.items as { data: TranslationStatus }[], outdated.hasMore),
		...workList("Needs translation", pending.items as { data: TranslationStatus }[], pending.hasMore),
	];
	if (outdatedCount + pendingCount === 0) {
		blocks.push({ type: "context", text: "Nothing to translate. New translations appear here once created from the editor panel." });
	}
	return { blocks };
}
