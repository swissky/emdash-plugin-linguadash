import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Block, BlockResponse, MenuElement } from "@emdash-cms/blocks";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

import { statusId, type TranslationStatus } from "../src/panel.js";

let host: PluginRuntimeTestHost;

type Blocks = BlockResponse["blocks"];

function overview(response: BlockResponse): Blocks {
	const tab = response.blocks.find((block) => block.type === "tab");
	return tab?.type === "tab" ? tab.panels[0]!.blocks : response.blocks;
}

/** Section lines of the panel, or "title · languages" rows of the overview tables when given a page. */
function lines(response: BlockResponse): string[] {
	return rows(overview(response)).concat(
		overview(response).flatMap((block) => (block.type === "section" ? [withButton(block)] : [])),
	);
}

/** A panel line as the editor sees it: the language, then the label of its button. */
function withButton(block: Extract<Block, { type: "section" }>): string {
	return block.accessory?.type === "button" ? `${block.text} · ${block.accessory.label}` : block.text;
}

function rows(blocks: Blocks): string[] {
	return blocks.flatMap((block) =>
		block.type === "table" ? block.rows.map((row) => `${String(row.title)} · ${String(row.languages)}`) : [],
	);
}

/** The overview's tabs by label, each with its "title · languages" rows in sorted order. */
function tabs(response: BlockResponse): Record<string, string[]> {
	const tab = response.blocks.find((block) => block.type === "tab");
	const panels = tab?.type === "tab" ? tab.panels.filter((panel) => panel.label !== "Settings") : [];
	return Object.fromEntries(
		panels.map((panel) => [panel.label, rows(panel.blocks).sort()]),
	);
}

function buttons(response: BlockResponse): string[] {
	return response.blocks.flatMap((block) =>
		block.type === "section" && block.accessory?.type === "button"
			? [`${block.accessory.action_id}:${String(block.accessory.value)}`]
			: [],
	);
}

function storedStatus(entryId: string) {
	return host.inspect.storage.get<TranslationStatus>("status", statusId("posts", entryId));
}

/** Save hooks run after the response, so poll for their effect. */
async function until(check: () => Promise<boolean>) {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (await check()) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error("condition not reached");
}

beforeEach(async () => {
	host = await createPluginRuntimeTestHost({
		site: { locale: "de" },
		i18n: { defaultLocale: "de", locales: ["de", "fr", "it"] },
	});
	await host.fixtures.collection({
		slug: "posts",
		label: "Posts",
		fields: [
			{ slug: "title", label: "Title", type: "string", translatable: true },
			{ slug: "rating", label: "Rating", type: "integer", translatable: false },
		],
	});
	await host.fixtures.plugin.setting("targetLocales", "fr, it");
});

afterEach(async () => {
	await host.dispose();
});

describe("translations panel", () => {
	it("lists missing languages and creates a draft copy in the target locale", async () => {
		const source = await host.fixtures.content("posts", {
			slug: "hallo-welt",
			locale: "de",
			data: { title: "Hallo Welt", rating: 4 },
		});

		const initial = await host.admin.loadEditorPanel("translations", "posts", source.id);
		expect(lines(initial)).toEqual(["French · Missing · Create draft", "Italian · Missing · Create draft"]);
		expect(buttons(initial)).toEqual(["create:fr", "create:it"]);

		const created = await host.admin.actEditorPanel("translations", "posts", source.id, "create", {
			value: "fr",
		});
		expect(created.toast?.type).toBe("success");
		expect(lines(created)).toContain("French · Draft");
		expect(created.blocks.some((block) => block.type === "section" && block.accessory?.type === "link")).toBe(false);

		const rows = await host.inspect.content.list("posts");
		const fr = rows.find((row) => row.locale === "fr");
		expect(fr).toMatchObject({
			status: "draft",
			slug: "hallo-welt",
			translationGroup: source.translationGroup,
			data: { title: "Hallo Welt", rating: 4 },
		});
	});

	it("shows a translation as done once published and as outdated when the source changes", async () => {
		const source = await host.fixtures.content("posts", {
			slug: "hallo-welt",
			locale: "de",
			data: { title: "Hallo Welt", rating: 4 },
		});
		await host.admin.actEditorPanel("translations", "posts", source.id, "create", { value: "fr" });
		const fr = (await host.inspect.content.list("posts")).find((row) => row.locale === "fr")!;

		await host.actions.content.publish("posts", fr.id);
		await until(async () => (await storedStatus(fr.id))?.state === "translated");
		const done = await host.admin.loadEditorPanel("translations", "posts", fr.id);
		expect(lines(done)).toContain("French (this entry) · Done ✓");
		expect(buttons(done)).toEqual(["create:it"]);

		await host.actions.content.update("posts", source.id, { data: { title: "Hallo neue Welt" } });
		const afterEdit = await host.admin.loadEditorPanel("translations", "posts", fr.id);
		expect(lines(afterEdit)).toContain("French (this entry) · Outdated");
		expect(buttons(afterEdit)).toEqual(["create:it"]);
	});

	it("capitalizes language names that start a line in a French admin", async () => {
		const source = await host.fixtures.content("posts", {
			slug: "hallo-welt",
			locale: "de",
			data: { title: "Hallo Welt", rating: 4 },
		});

		const panel = await host.admin.loadEditorPanel("translations", "posts", source.id, { locale: "fr" });
		expect(lines(panel)).toEqual(["Français · Manquant · Créer un brouillon", "Italien · Manquant · Créer un brouillon"]);
	});

	it("shows a translation published before LinguaDash as done", async () => {
		const source = await host.fixtures.content("posts", { slug: "hallo", locale: "de", data: { title: "Hallo" } });
		const fr = await host.fixtures.content("posts", {
			slug: "salut",
			locale: "fr",
			status: "published",
			translationOf: source.id,
			data: { title: "Salut" },
		});
		const panel = await host.admin.loadEditorPanel("translations", "posts", fr.id);
		expect(lines(panel)).toContain("French (this entry) · Done ✓");
	});

	it("flags a translation as outdated when the source changes and clears it when the source is reverted", async () => {
		await host.fixtures.plugin.setting("targetLocales", "fr");
		const source = await host.fixtures.content("posts", {
			slug: "hallo-welt",
			locale: "de",
			data: { title: "Hallo Welt", rating: 4 },
		});
		await host.admin.actEditorPanel("translations", "posts", source.id, "create", { value: "fr" });
		const fr = (await host.inspect.content.list("posts")).find((row) => row.locale === "fr")!;
		await host.actions.content.publish("posts", fr.id);
		await until(async () => (await storedStatus(fr.id))?.state === "translated");
		const outdated = () => storedStatus(fr.id).then((status) => status?.outdated);

		await host.actions.content.update("posts", source.id, { data: { title: "Hallo neue Welt" } });
		await until(async () => (await outdated()) === true);
		const stale = await host.admin.loadPage("/translations");
		expect(tabs(stale)).toEqual({
			"Missing (0)": [],
			"Outdated (1)": ["Hallo Welt · French"],
			"To review (0)": [],
		});
		expect(stale.blocks.find((block) => block.type === "tab")).toMatchObject({ default_tab: 1 });

		await host.actions.content.update("posts", source.id, { data: { title: "Hallo Welt" } });
		await until(async () => (await outdated()) === false);
		expect(tabs(await host.admin.loadPage("/translations"))).toEqual({
			"Missing (0)": [],
			"Outdated (0)": [],
			"To review (0)": [],
		});
	});

	it("counts publishing a translation as bringing it up to date", async () => {
		await host.fixtures.plugin.setting("targetLocales", "fr");
		const source = await host.fixtures.content("posts", { slug: "hallo", locale: "de", data: { title: "Hallo" } });
		await host.admin.actEditorPanel("translations", "posts", source.id, "create", { value: "fr" });
		const fr = (await host.inspect.content.list("posts")).find((row) => row.locale === "fr")!;
		expect(tabs(await host.admin.loadPage("/translations"))).toMatchObject({ "To review (1)": ["Hallo · French"] });

		await host.actions.content.publish("posts", fr.id);
		await until(async () => (await storedStatus(fr.id))?.state === "translated");
		expect(tabs(await host.admin.loadPage("/translations"))).toMatchObject({ "To review (0)": [], "Outdated (0)": [] });

		await host.actions.content.update("posts", source.id, { data: { title: "Hallo neu" } });
		await until(async () => (await storedStatus(fr.id))?.outdated === true);
		await host.actions.content.publish("posts", fr.id);
		await until(async () => (await storedStatus(fr.id))?.outdated === false);
		expect(tabs(await host.admin.loadPage("/translations"))).toMatchObject({ "To review (0)": [], "Outdated (0)": [] });
	});

	it("lists untranslated copies on the overview under their latest title", async () => {
		await host.fixtures.plugin.setting("targetLocales", "fr");
		const source = await host.fixtures.content("posts", { slug: "hallo", locale: "de", data: { title: "Hallo" } });
		await host.admin.actEditorPanel("translations", "posts", source.id, "create", { value: "fr" });
		const fr = (await host.inspect.content.list("posts")).find((row) => row.locale === "fr")!;

		await host.actions.content.update("posts", fr.id, { data: { title: "Bonjour" } });
		await until(async () => (await storedStatus(fr.id))?.title === "Bonjour");

		expect(tabs(await host.admin.loadPage("/translations"))).toEqual({
			"Missing (0)": [],
			"Outdated (0)": [],
			"To review (1)": ["Bonjour · French"],
		});

		await host.actions.content.trash("posts", fr.id);
		await until(async () => (await storedStatus(fr.id)) === null);
		expect(tabs(await host.admin.loadPage("/translations"))).toMatchObject({
			"Missing (1)": ["Hallo · French"],
			"To review (0)": [],
		});
	});

	it("lists source entries by the target languages they have no entry in", async () => {
		const hallo = await host.fixtures.content("posts", { slug: "hallo", locale: "de", data: { title: "Hallo" } });
		await host.fixtures.content("posts", { slug: "tschuess", locale: "de", data: { title: "Tschüss" } });
		await host.fixtures.content("posts", { slug: "hello", locale: "en", data: { title: "Hello" } });
		await host.admin.actEditorPanel("translations", "posts", hallo.id, "create", { value: "fr" });

		expect(tabs(await host.admin.loadPage("/translations"))).toEqual({
			"Missing (3)": ["Hallo · Italian", "Tschüss · French, Italian"],
			"Outdated (0)": [],
			"To review (1)": ["Hallo · French"],
		});
	});

	it("counts translations created outside LinguaDash as not reviewed on the overview", async () => {
		const source = await host.fixtures.content("posts", { slug: "hallo", locale: "de", data: { title: "Hallo" } });
		const salut = await host.fixtures.content("posts", {
			slug: "salut",
			locale: "fr",
			translationOf: source.id,
			data: { title: "Salut" },
		});

		expect(tabs(await host.admin.loadPage("/translations"))).toEqual({
			"Missing (1)": ["Hallo · Italian"],
			"Outdated (0)": [],
			"To review (1)": ["Salut · French"],
		});

		await host.actions.content.publish("posts", salut.id);
		await until(async () => (await storedStatus(salut.id))?.state === "translated");
		expect(tabs(await host.admin.loadPage("/translations"))).toMatchObject({ "To review (0)": [], "Outdated (0)": [] });
	});

	it("adds a missing language picked from the row's menu", async () => {
		const editor = await host.fixtures.user({ email: "editor@example.com", role: "editor" });
		const source = await host.fixtures.content("posts", { slug: "hallo", locale: "de", data: { title: "Hallo" } });

		const page = await host.admin.loadPage("/translations", { user: editor });
		const table = overview(page).find((block) => block.type === "table");
		const menu = (table?.type === "table" ? table.rows.find((row) => row.title === "Hallo")?.action : undefined) as
			| MenuElement
			| undefined;
		expect(menu?.type).toBe("menu");
		expect(menu!.items.map((item) => item.label)).toEqual(["French", "Italian", "All languages"]);

		const response = await host.admin.act("/translations", menu!.action_id, { user: editor, value: menu!.items[0]!.value });
		expect(response.toast).toMatchObject({ type: "success" });
		const fr = (await host.inspect.content.list("posts")).find((item) => item.locale === "fr");
		expect(fr?.translationGroup).toBe(source.translationGroup ?? source.id);
		expect(tabs(response)).toMatchObject({ "Missing (1)": ["Hallo · Italian"], "To review (1)": ["Hallo · French"] });

		const all = await host.admin.act("/translations", menu!.action_id, { user: editor, value: menu!.items[2]!.value });
		expect(all.toast).toMatchObject({ type: "success" });
		expect((await host.inspect.content.list("posts")).map((row) => row.locale).sort()).toEqual(["de", "fr", "it"]);
		expect(tabs(all)).toMatchObject({ "Missing (0)": [], "To review (2)": ["Hallo · French", "Hallo · Italian"] });
	});

	it("ignores a create request for a language that is not configured", async () => {
		const source = await host.fixtures.content("posts", { slug: "hallo", locale: "de", data: { title: "Hallo" } });
		const response = await host.admin.actEditorPanel("translations", "posts", source.id, "create", {
			value: "es",
		});
		expect(response.toast?.type).toBe("info");
		expect((await host.inspect.content.list("posts")).map((row) => row.locale)).toEqual(["de"]);
	});
});
