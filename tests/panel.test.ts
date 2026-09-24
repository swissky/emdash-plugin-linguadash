import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BlockResponse } from "@emdash-cms/blocks";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

let host: PluginRuntimeTestHost;

function lines(response: BlockResponse): string[] {
	return response.blocks.flatMap((block) => (block.type === "section" ? [block.text] : []));
}

function buttons(response: BlockResponse): string[] {
	return response.blocks.flatMap((block) =>
		block.type === "actions"
			? block.elements.flatMap((el) => (el.type === "button" ? [`${el.action_id}:${String(el.value)}`] : []))
			: [],
	);
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
		expect(lines(initial)).toEqual([
			"DE (this entry) — Source · draft",
			"FR — Not translated",
			"IT — Not translated",
		]);
		expect(buttons(initial)).toEqual(["create:fr", "create:it"]);

		const created = await host.admin.actEditorPanel("translations", "posts", source.id, "create", {
			value: "fr",
		});
		expect(created.toast?.type).toBe("success");
		expect(lines(created)).toContain("FR — draft · Needs translation");

		const rows = await host.inspect.content.list("posts");
		const fr = rows.find((row) => row.locale === "fr");
		expect(fr).toMatchObject({
			status: "draft",
			slug: "hallo-welt",
			translationGroup: source.translationGroup,
			data: { title: "Hallo Welt", rating: 4 },
		});
	});

	it("marks a translation done and flags it as outdated when the source changes", async () => {
		const source = await host.fixtures.content("posts", {
			slug: "hallo-welt",
			locale: "de",
			data: { title: "Hallo Welt", rating: 4 },
		});
		await host.admin.actEditorPanel("translations", "posts", source.id, "create", { value: "fr" });
		const fr = (await host.inspect.content.list("posts")).find((row) => row.locale === "fr")!;

		const done = await host.admin.actEditorPanel("translations", "posts", fr.id, "mark-translated", {
			value: "fr",
		});
		expect(lines(done)).toContain("FR (this entry) — draft · Translated");
		expect(buttons(done)).not.toContain("mark-translated:fr");

		await host.actions.content.update("posts", source.id, { data: { title: "Hallo neue Welt" } });
		const afterEdit = await host.admin.loadEditorPanel("translations", "posts", fr.id);
		expect(lines(afterEdit)).toContain("FR (this entry) — draft · Outdated: source changed");
		expect(buttons(afterEdit)).toContain("mark-translated:fr");
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
