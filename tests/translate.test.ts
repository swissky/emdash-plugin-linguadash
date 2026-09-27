import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Block, BlockResponse } from "@emdash-cms/blocks";
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

		const { data: result } = applyTranslations(
			plans,
			["Fromage &amp; pain &lt;3", 'Bonjour <s i="1">monde</s>'],
			data,
		);
		expect(result.title).toBe("Fromage & pain <3");
		expect(result.slug).toBe("kaese");
		const [block, image] = result.body as typeof body;
		expect(block!.children).toEqual([
			{ _type: "span", _key: "s1", text: "Bonjour ", marks: [] },
			{ _type: "span", _key: "s2", text: "monde", marks: ["strong"] },
		]);
		expect(image).toEqual(body[1]);
	});

	it("translates the SEO title and description after the content fields", () => {
		const seo = { title: "Käse <Shop>", description: "", image: "media-1" };
		const { segments, plans } = collectSegments(fields, { title: "Käse" }, seo);
		expect(segments).toEqual(["Käse", "Käse &lt;Shop&gt;"]);

		const result = applyTranslations(plans, ["Fromage", "Fromage &lt;Boutique&gt;"], { title: "Käse" }, seo);
		expect(result.data).toEqual({ title: "Fromage" });
		expect(result.seo).toEqual({ title: "Fromage <Boutique>", description: "", image: "media-1" });
	});

	it("maps locales to DeepL target codes", () => {
		expect(["fr", "en", "pt", "de-ch", "pt_br"].map(deeplTargetLang)).toEqual(["FR", "EN-GB", "PT-PT", "DE-CH", "PT-BR"]);
	});
});

let host: PluginRuntimeTestHost;

function withButton(block: Extract<Block, { type: "section" }>): string {
	return block.accessory?.type === "button" ? `${block.text} · ${block.accessory.label}` : block.text;
}

function lines(response: BlockResponse): string[] {
	return response.blocks.flatMap((block) => (block.type === "section" ? [withButton(block)] : []));
}

function buttons(response: BlockResponse): string[] {
	return response.blocks.flatMap((block) =>
		block.type === "section" && block.accessory?.type === "button"
			? [`${block.accessory.action_id}:${String(block.accessory.value)}`]
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

	it("machine translates through DeepL, retranslates outdated drafts and leaves published translations alone", async () => {
		const source = await host.fixtures.content("posts", {
			slug: "hallo-welt",
			locale: "de",
			data: { title: "Hallo Welt", body },
		});
		const initial = await host.admin.loadEditorPanel("translations", "posts", source.id);
		expect(buttons(initial)).toEqual(["machine:fr"]);

		await host.http.respond(
			"https://api-free.deepl.com/v2/translate",
			deeplResponse(["Bonjour le monde", 'Bonjour <s i="1">monde</s>']),
		);
		const done = await host.admin.actEditorPanel("translations", "posts", source.id, "machine", { value: "fr" });
		expect(done.toast?.type).toBe("success");
		expect(lines(done)).toContain("French · Draft");

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

		expect(buttons(done)).toEqual([]);

		await host.actions.content.update("posts", source.id, { data: { title: "Hallo neue Welt" } });
		const stale = await host.admin.loadEditorPanel("translations", "posts", fr.id);
		expect(lines(stale)).toContain("French (this entry) · Outdated · Retranslate");
		await host.http.respond(
			"https://api-free.deepl.com/v2/translate",
			deeplResponse(["Bonjour le nouveau monde", 'Bonjour <s i="1">monde</s>']),
		);
		const retranslated = await host.admin.actEditorPanel("translations", "posts", fr.id, "machine", {
			value: "fr",
		});
		expect(lines(retranslated)).toContain("French (this entry) · Draft");

		await host.actions.content.publish("posts", fr.id);
		await until(async () => (await host.inspect.storage.get<{ state: string }>("status", `posts:${fr.id}`))?.state === "translated");
		await host.actions.content.update("posts", source.id, { data: { title: "Hallo Welt" } });
		const published = await host.admin.loadEditorPanel("translations", "posts", fr.id);
		expect(lines(published)).toContain("French (this entry) · Outdated");
		const refused = await host.admin.actEditorPanel("translations", "posts", fr.id, "machine", { value: "fr" });
		expect(refused.toast?.type).toBe("info");
		expect(host.http.requests()).toHaveLength(2);
	});

	it("rejects a malformed Cloudflare account ID before sending anything", async () => {
		await host.actions.plugin.updateSettings({
			provider: "cloudflare",
			cloudflareAccountId: "../../evil",
			cloudflareApiToken: "cf-token",
		});
		const source = await host.fixtures.content("posts", { slug: "hallo", locale: "de", data: { title: "Hallo" } });

		const response = await host.admin.actEditorPanel("translations", "posts", source.id, "machine", { value: "fr" });
		expect(response.toast?.type).toBe("error");
		expect(host.http.requests()).toEqual([]);
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

async function until(check: () => Promise<boolean>) {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (await check()) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error("condition not reached");
}

describe("SEO and Cloudflare AI Gateway", () => {
	const accountId = "0123456789abcdef0123456789abcdef";
	const gatewayUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;

	beforeEach(async () => {
		process.env.EMDASH_ENCRYPTION_KEY = `emdash_enc_v1_${Buffer.alloc(32, 7).toString("base64url")}`;
		host = await createPluginRuntimeTestHost({
			site: { locale: "de" },
			i18n: { defaultLocale: "de", locales: ["de", "fr"] },
		});
		await host.fixtures.collection({
			slug: "pages",
			label: "Pages",
			hasSeo: true,
			fields: [{ slug: "title", label: "Title", type: "string", translatable: true }],
		});
		const saved = await host.actions.plugin.updateSettings({
			targetLocales: "fr",
			provider: "cloudflare",
			cloudflareAccountId: accountId,
			cloudflareApiToken: "cf-token",
			cloudflareGatewayId: "linguadash",
			instructions: "Keep the brand name Seeblick untranslated.",
		});
		expect(saved.success).toBe(true);
	});

	afterEach(async () => {
		await host.dispose();
	});

	async function sourceWithSeo() {
		const source = await host.fixtures.content("pages", { slug: "angebot", locale: "de", data: { title: "Angebot" } });
		await host.actions.content.update("pages", source.id, {
			seo: {
				title: "Unser Angebot",
				description: "Alles über unser Angebot",
				image: "media-1",
				canonical: "https://example.com/de/angebot",
				noIndex: false,
			},
		});
		return source;
	}

	async function frenchSeo() {
		const fr = (await host.inspect.content.list("pages")).find((row) => row.locale === "fr")!;
		// inspect.content.get omits SEO; an empty update returns the hydrated item without changing it.
		const item = await host.actions.content.update("pages", fr.id, {});
		return { id: fr.id, seo: item.success ? item.data.item.seo : undefined };
	}

	it("machine translates the SEO title and description through the gateway, without the canonical URL", async () => {
		const source = await sourceWithSeo();
		await host.http.respond(
			gatewayUrl,
			Response.json({
				choices: [
					{
						message: {
							content:
								'```json\n{"segments": ["Notre offre", "Notre offre", "Tout sur notre offre"]}\n```',
						},
					},
				],
			}),
		);

		const done = await host.admin.actEditorPanel("translations", "pages", source.id, "machine", { value: "fr" });
		expect(done.toast?.type).toBe("success");

		const [request] = host.http.requests();
		expect(request!.url).toBe(gatewayUrl);
		expect(request!.headers.authorization).toBe("Bearer cf-token");
		expect(request!.headers["cf-aig-gateway-id"]).toBe("linguadash");
		const body = JSON.parse(new TextDecoder().decode(request!.body)) as { model: string; messages: { content: string }[] };
		expect(body.model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
		expect(body.messages[0]!.content).toContain("Keep the brand name Seeblick untranslated.");
		expect(JSON.parse(body.messages[1]!.content).segments).toEqual([
			"Angebot",
			"Unser Angebot",
			"Alles über unser Angebot",
		]);

		const { seo } = await frenchSeo();
		expect(seo).toMatchObject({
			title: "Notre offre",
			description: "Tout sur notre offre",
			image: "media-1",
			canonical: null,
			noIndex: false,
		});
	});

	it("copies SEO into a new translation and flags it outdated when the source's meta title changes", async () => {
		const source = await sourceWithSeo();
		await host.admin.actEditorPanel("translations", "pages", source.id, "create", { value: "fr" });
		const { id, seo } = await frenchSeo();
		expect(seo).toMatchObject({ title: "Unser Angebot", image: "media-1", canonical: null });

		const panel = async () => lines(await host.admin.loadEditorPanel("translations", "pages", id));
		await host.actions.content.publish("pages", id);
		await until(async () => (await panel()).includes("French (this entry) · Done ✓"));

		await host.actions.content.update("pages", source.id, { seo: { title: "Unser neues Angebot" } });
		await until(async () => (await panel()).includes("French (this entry) · Outdated"));
		const status = await host.inspect.storage.get<{ outdated: boolean }>("status", `pages:${id}`);
		expect(status?.outdated).toBe(true);
	});
});
