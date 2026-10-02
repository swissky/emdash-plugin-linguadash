import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BlockResponse } from "@emdash-cms/blocks";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

let host: PluginRuntimeTestHost;
let admin: Awaited<ReturnType<PluginRuntimeTestHost["fixtures"]["user"]>>;

/** Blocks of the page, with the overview and settings tab panels flattened in order. */
function flat(response: BlockResponse): BlockResponse["blocks"] {
	return response.blocks.flatMap((block) => (block.type === "tab" ? block.panels.flatMap((panel) => panel.blocks) : [block]));
}

function texts(response: BlockResponse): string[] {
	return flat(response).flatMap((block) =>
		block.type === "section" || block.type === "context" ? [block.text] : block.type === "banner" ? [block.title ?? ""] : [],
	);
}

function formFields(response: BlockResponse) {
	const form = flat(response).find((block) => block.type === "form");
	return form?.type === "form" ? form.fields : [];
}

const deeplForm = { provider: "deepl", formality: "default" };

function language(action: "add-locale" | "remove-locale", code: string, user = admin) {
	return host.admin.act("/translations", action, { user, value: code });
}

beforeEach(async () => {
	process.env.EMDASH_ENCRYPTION_KEY = `emdash_enc_v1_${Buffer.alloc(32, 7).toString("base64url")}`;
	host = await createPluginRuntimeTestHost({
		site: { locale: "de" },
		i18n: { defaultLocale: "de", locales: ["de", "fr"] },
	});
	admin = await host.fixtures.user({ email: "admin@example.com", role: "admin" });
});

afterEach(async () => {
	await host.dispose();
});

describe("onboarding", () => {
	it("walks through the setup steps until languages and translatable fields exist", async () => {
		await host.fixtures.collection({
			slug: "posts",
			label: "Posts",
			fields: [{ slug: "title", label: "Title", type: "string", translatable: false }],
		});
		const fresh = texts(await host.admin.loadPage("/translations", { user: admin }));
		expect(fresh).toContainEqual(expect.stringMatching(/^○ Languages/));
		expect(fresh).toContainEqual(expect.stringMatching(/^○ Translatable fields/));
		const opened = await host.admin.act("/translations", "open-settings", { user: admin, value: "settings" });
		expect(opened.blocks[0]).toMatchObject({ type: "tab", default_tab: 1 });

		await language("add-locale", "fr");
		const halfway = texts(await host.admin.loadPage("/translations", { user: admin }));
		expect(halfway).toContain("✓ Languages — Translating German into French.");
		expect(halfway).toContainEqual(expect.stringMatching(/^○ Translatable fields/));

		await host.fixtures.collection({
			slug: "pages",
			label: "Pages",
			fields: [{ slug: "title", label: "Title", type: "string", translatable: true }],
		});
		const ready = await host.admin.loadPage("/translations", { user: admin });
		const tab = ready.blocks.find((block) => block.type === "tab");
		expect(tab?.type === "tab" && tab.panels.map((panel) => panel.label)).toEqual([
			"Missing (0)",
			"Outdated (0)",
			"To review (0)",
			"Settings",
		]);
		expect(texts(ready)).toContain("German → French · Machine translation: Off");
	});
});

describe("settings page", () => {
	it("stores the API key encrypted and keeps it when the field is left untouched", async () => {
		const saved = await host.admin.submit("/translations", "save", { ...deeplForm, deeplApiKey: "key-1:fx" }, { user: admin });
		expect(saved.toast?.type).toBe("success");
		const stored = await host.inspect.settings.raw("deeplApiKey");
		expect(stored).toMatchObject({ $emdash: "plugin-setting" });
		expect(JSON.stringify(stored)).not.toContain("key-1");

		const again = await host.admin.submit("/translations", "save", { ...deeplForm, deeplApiKey: "" }, { user: admin });
		expect(again.toast?.type).toBe("success");
		expect(await host.inspect.settings.raw("deeplApiKey")).toEqual(stored);
		expect(formFields(again)).toContainEqual(expect.objectContaining({ action_id: "deeplApiKey", has_value: true }));

		const removed = await host.admin.act("/translations", "forget-keys", { user: admin, value: "forget-keys" });
		expect(removed.toast?.type).toBe("success");
		expect(await host.inspect.setting("deeplApiKey")).toBeNull();
	});

	it("adds and removes target languages, listing only the chosen ones", async () => {
		await language("add-locale", "fr");
		const added = await language("add-locale", "pt-BR");
		expect(added.toast).toEqual({ type: "success", message: "Brazilian Portuguese added" });
		expect(await host.inspect.setting("targetLocales")).toBe("fr, pt-br");
		expect(texts(added)).toEqual(expect.arrayContaining(["French (fr)", "Brazilian Portuguese (pt-br)"]));
		const picker = flat(added).flatMap((block) => (block.type === "actions" ? block.elements : []))
			.find((element) => element.type === "combobox");
		const offered = picker?.type === "combobox" ? picker.options.map((option) => option.value) : [];
		expect(offered).toContain("it");
		expect(offered).not.toContain("fr");
		expect(offered).not.toContain("de");

		await language("remove-locale", "fr");
		expect(await host.inspect.setting("targetLocales")).toBe("pt-br");

		const rejected = await language("add-locale", "<script>");
		expect(rejected.toast?.type).toBe("error");
		expect(await host.inspect.setting("targetLocales")).toBe("pt-br");
	});

	it("shows a rejected submission again with its error and without saving it", async () => {
		await host.admin.submit("/translations", "save", deeplForm, { user: admin });
		const response = await host.admin.submit(
			"/translations",
			"save",
			{ provider: "cloudflare", cloudflareAccountId: "../../evil" },
			{ user: admin },
		);
		expect(texts(response)).toContain("The Cloudflare account ID has 32 hexadecimal characters.");
		expect(formFields(response)).toContainEqual(
			expect.objectContaining({ action_id: "cloudflareAccountId", initial_value: "../../evil" }),
		);
		expect(formFields(response)).toContainEqual(expect.objectContaining({ action_id: "provider", initial_value: "cloudflare" }));
		expect(await host.inspect.setting("provider")).toBe("deepl");
		expect(await host.inspect.setting("cloudflareAccountId")).toBe("");

		const glossaries = await host.admin.submit(
			"/translations",
			"save",
			{ ...deeplForm, deeplGlossaryIds: "not-a-glossary" },
			{ user: admin },
		);
		expect(texts(glossaries)).toContain("Enter up to 5 DeepL glossary IDs, separated by commas.");
		const region = await host.admin.submit(
			"/translations",
			"save",
			{ provider: "azure", azureRegion: "west europe" },
			{ user: admin },
		);
		expect(texts(region)).toContain("The Azure region may only contain letters, digits and -.");
		expect(await host.inspect.setting("provider")).toBe("deepl");
	});

	it("explains a missing encryption key instead of saving the provider without its key", async () => {
		delete process.env.EMDASH_ENCRYPTION_KEY;
		const response = await host.admin.submit("/translations", "save", { ...deeplForm, deeplApiKey: "abc:fx" }, { user: admin });
		expect(texts(response)).toContainEqual(expect.stringContaining("Set EMDASH_ENCRYPTION_KEY on the server"));
		expect(await host.inspect.setting("provider")).toBeNull();
		expect(await host.inspect.setting("deeplApiKey")).toBeNull();
	});

	it("does not let editors change settings", async () => {
		const editor = await host.fixtures.user({ email: "editor@example.com", role: "editor" });
		const response = await host.admin.submit("/translations", "save", { ...deeplForm, deeplApiKey: "stolen" }, { user: editor });
		expect(response.toast).toEqual({ type: "error", message: "Only administrators can change translation settings." });
		expect(response.blocks.some((block) => block.type === "tab")).toBe(false);
		expect(await host.inspect.setting("deeplApiKey")).toBeNull();
		expect((await language("add-locale", "fr", editor)).toast?.type).toBe("error");
		expect(await host.inspect.setting("targetLocales")).toBeNull();
	});

	it("tests the saved provider with a sample translation, passing the site's instructions along", async () => {
		await language("add-locale", "fr");
		const tooLong = await host.admin.submit(
			"/translations",
			"save",
			{ ...deeplForm, deeplApiKey: "key-1:fx", instructions: "x".repeat(1001) },
			{ user: admin },
		);
		expect(texts(tooLong)).toContain("Keep the instructions to 1000 characters or fewer.");
		await host.admin.submit(
			"/translations",
			"save",
			{ ...deeplForm, deeplApiKey: "key-1:fx", instructions: "A Swiss hotel website." },
			{ user: admin },
		);
		await host.http.respond(
			"https://api-free.deepl.com/v2/translate",
			Response.json({ translations: [{ detected_source_language: "EN", text: "Bonjour et bienvenue." }] }),
		);
		const response = await host.admin.act("/translations", "test", { user: admin, value: "test" });
		expect(response.toast).toEqual({ type: "success", message: "DeepL works: “Bonjour et bienvenue.” (French)" });
		const [request] = host.http.requests();
		expect(JSON.parse(new TextDecoder().decode(request!.body))).toMatchObject({ context: "A Swiss hotel website." });

		await host.http.respond("https://api-free.deepl.com/v2/translate", new Response("Forbidden", { status: 403 }));
		const failed = await host.admin.act("/translations", "test", { user: admin, value: "test" });
		expect(failed.toast?.type).toBe("error");
	});
});

describe("admin language", () => {
	it("renders the page and the panel in the editor's admin language", async () => {
		await host.fixtures.collection({
			slug: "posts",
			label: "Posts",
			fields: [{ slug: "title", label: "Title", type: "string", translatable: true }],
		});
		const page = await host.admin.loadPage("/translations", { user: admin, locale: "de" });
		const tab = page.blocks.find((block) => block.type === "tab");
		expect(tab?.type === "tab" && tab.panels.map((panel) => panel.label)).toEqual(["Status", "Einstellungen"]);
		expect(texts(page)).toContainEqual(expect.stringMatching(/^○ Sprachen — /));

		await language("add-locale", "fr");
		const item = await host.fixtures.content("posts", { slug: "hallo", locale: "de", data: { title: "Hallo" } });
		const panel = await host.admin.loadEditorPanel("translations", "posts", item.id, { locale: "de" });
		expect(texts(panel)).toContain("Französisch · Fehlt");
		expect(flat(panel).flatMap((block) => (block.type === "section" && block.accessory?.type === "button" ? [block.accessory.label] : []))).toEqual(["Entwurf anlegen"]);
	});
});

describe("editor panel", () => {
	it("explains how to enable translation on a collection without translatable fields", async () => {
		await host.fixtures.collection({
			slug: "products",
			label: "Products",
			fields: [{ slug: "title", label: "Title", type: "string", translatable: false }],
		});
		const item = await host.fixtures.content("products", { slug: "tisch", locale: "de", data: { title: "Tisch" } });
		const response = await host.admin.loadEditorPanel("translations", "products", item.id);
		expect(texts(response)).toEqual([expect.stringContaining("No field in this collection is marked translatable")]);
	});
});
