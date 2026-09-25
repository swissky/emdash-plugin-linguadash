import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BlockResponse } from "@emdash-cms/blocks";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

import { applyTranslations, collectSegments, deeplTargetLang } from "../src/translate.js";

const body = [
	{
		_type: "block",
		_key: "b1",
		style: "normal",
		markDefs: [],
		children: [
			{ _type: "span", _key: "s1", text: "Hallo ", marks: [] },
			{ _type: "span", _key: "s2", text: "Welt", marks: ["strong"] },
		],
	},
	{ _type: "image", _key: "i1", asset: { _ref: "media-1" } },
];

describe("segments for machine translation", () => {
	const fields = [
		{ slug: "title", type: "string" },
		{ slug: "body", type: "portableText" },
		{ slug: "slug", type: "slug" },
	];

	it("sends text fields and text blocks, and writes the translations back in place", () => {
		const data = { title: "Käse & Brot <3", body, slug: "kaese" };
		const { segments, plans } = collectSegments(fields, data);
		expect(segments).toEqual(["Käse &amp; Brot &lt;3", 'Hallo <s i="1">Welt</s>']);

		const result = applyTranslations(plans, ["Fromage &amp; pain &lt;3", 'Bonjour <s i="1">monde</s>'], data);
		expect(result.title).toBe("Fromage & pain <3");
		expect(result.slug).toBe("kaese");
		const [block, image] = result.body as typeof body;
		expect(block!.children).toEqual([
			{ _type: "span", _key: "s1", text: "Bonjour ", marks: [] },
			{ _type: "span", _key: "s2", text: "monde", marks: ["strong"] },
		]);
		expect(image).toEqual(body[1]);
	});

	it("maps locales to DeepL target codes", () => {
		expect(["fr", "en", "pt", "de-ch", "pt_br"].map(deeplTargetLang)).toEqual(["FR", "EN-GB", "PT-PT", "DE-CH", "PT-BR"]);
	});
});

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

function deeplResponse(texts: string[]) {
	return Response.json({ translations: texts.map((text) => ({ detected_source_language: "DE", text })) });
}

describe("machine translation in the panel", () => {
	beforeEach(async () => {
		process.env.EMDASH_ENCRYPTION_KEY = `emdash_enc_v1_${Buffer.alloc(32, 7).toString("base64url")}`;
		host = await createPluginRuntimeTestHost({
			site: { locale: "de" },
			i18n: { defaultLocale: "de", locales: ["de", "fr"] },
		});
		await host.fixtures.collection({
			slug: "posts",
			label: "Posts",
			fields: [
				{ slug: "title", label: "Title", type: "string", translatable: true },
				{ slug: "body", label: "Body", type: "portableText", translatable: true },
			],
		});
		const saved = await host.actions.plugin.updateSettings({
			targetLocales: "fr",
			provider: "deepl",
			deeplApiKey: "secret-key:fx",
		});
		expect(saved.success).toBe(true);
	});

	afterEach(async () => {
		await host.dispose();
	});

	it("creates a machine-translated draft through DeepL and keeps it retranslatable until reviewed", async () => {
		const source = await host.fixtures.content("posts", {
			slug: "hallo-welt",
			locale: "de",
			data: { title: "Hallo Welt", body },
		});
		const initial = await host.admin.loadEditorPanel("translations", "posts", source.id);
		expect(buttons(initial)).toEqual(["machine:fr", "create:fr"]);

		await host.http.respond(
			"https://api-free.deepl.com/v2/translate",
			deeplResponse(["Bonjour le monde", 'Bonjour <s i="1">monde</s>']),
		);
		const done = await host.admin.actEditorPanel("translations", "posts", source.id, "machine", { value: "fr" });
		expect(done.toast?.type).toBe("success");
		expect(lines(done)).toContain("FR — draft · Machine translated, needs review");

		const [request] = host.http.requests();
		expect(request!.headers.authorization).toBe("DeepL-Auth-Key secret-key:fx");
		expect(JSON.parse(new TextDecoder().decode(request!.body))).toMatchObject({
			text: ["Hallo Welt", 'Hallo <s i="1">Welt</s>'],
			source_lang: "DE",
			target_lang: "FR",
			tag_handling: "xml",
		});

		const fr = (await host.inspect.content.list("posts")).find((row) => row.locale === "fr")!;
		expect(fr.status).toBe("draft");
		expect(fr.translationGroup).toBe(source.translationGroup);
		expect(fr.data.title).toBe("Bonjour le monde");
		expect((fr.data.body as typeof body)[0]!.children!.map((c) => (c as { text: string }).text)).toEqual([
			"Bonjour ",
			"monde",
		]);

		const reviewed = await host.admin.actEditorPanel("translations", "posts", fr.id, "mark-translated", {
			value: "fr",
		});
		expect(buttons(reviewed)).not.toContain("machine:fr");
	});

	it("reports a rejected API key and saves nothing", async () => {
		const source = await host.fixtures.content("posts", { slug: "hallo", locale: "de", data: { title: "Hallo" } });
		await host.http.respond("https://api-free.deepl.com/v2/translate", new Response("Forbidden", { status: 403 }));

		const response = await host.admin.actEditorPanel("translations", "posts", source.id, "machine", { value: "fr" });
		expect(response.toast).toMatchObject({ type: "error" });
		expect(response.toast?.message).toContain("403");
		expect((await host.inspect.content.list("posts")).map((row) => row.locale)).toEqual(["de"]);
	});
});
