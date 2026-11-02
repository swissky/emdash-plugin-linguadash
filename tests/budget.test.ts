import { describe, expect, it } from "vitest";

import type { PluginContext } from "emdash/plugin";

import { uiFor } from "../src/i18n.js";
import { handlePanel } from "../src/panel.js";
import plugin from "../src/plugin.js";
import { renderPage } from "../src/status.js";

/** EmDash's Cloudflare sandbox runner allows this many host calls per plugin invocation. */
const BUDGET = 10;

const field = (slug: string) => ({ slug, label: slug, type: "string", translatable: true });
const collections = ["posts", "pages", "news"].map((slug) => ({ slug, label: slug, titleField: "title", fields: [field("title")] }));

/**
 * A host where every `ctx` method counts as one call, as each one is a bridge RPC in the sandbox.
 * The answers are just enough for the plugin to take its full code path.
 */
function countingHost(settings: Record<string, unknown>) {
	let calls = 0;
	const fn =
		<T>(result: T) =>
		async (..._args: unknown[]) => {
			calls++;
			return result;
		};
	const entry = { id: "e1", slug: "hello", status: "draft", locale: "de", translationGroup: "g1", data: { title: "Hallo" }, updatedAt: "" };
	const ctx = {
		site: { name: "", url: "", locale: "de" },
		settings: {
			list: fn(Object.entries(settings).map(([key, value]) => ({ key, value }))),
			get: fn(null),
			set: fn(undefined),
			delete: fn(true),
		},
		schema: { listCollections: fn(collections), getCollection: fn(collections[0]) },
		storage: {
			status: {
				count: fn(0),
				query: fn({ items: [], hasMore: false }),
				get: fn(null),
				getMany: fn(new Map()),
				put: fn(undefined),
				putMany: fn(undefined),
				delete: fn(true),
			},
		},
		content: {
			list: fn({ items: [entry], hasMore: false }),
			get: fn(entry),
			create: fn({ ...entry, id: "e2", locale: "fr" }),
			update: fn(entry),
			getTranslations: fn({ translationGroup: "g1", translations: [entry] }),
			getRevision: fn(null),
		},
		log: { debug: fn(undefined), info: fn(undefined), warn: fn(undefined), error: fn(undefined) },
	} as unknown as PluginContext;
	return { ctx, calls: () => calls };
}

const configured = {
	targetLocales: "fr, en",
	provider: "deepl",
	deeplApiKey: "key",
	formality: "more",
	instructions: "Be brief",
};
const ui = uiFor("en");
const panelUi = { surface: "content-editor-panel", locale: "en", entry: { collection: "posts", id: "e1", locale: "de" } };

describe("host call budget", () => {
	it("opens the Translations page on a fresh install", async () => {
		const host = countingHost({});
		await renderPage(host.ctx, ui, { admin: true });
		expect(host.calls()).toBeLessThanOrEqual(BUDGET);
	});

	it("opens the Translations page with languages, a provider and three collections", async () => {
		const host = countingHost(configured);
		await renderPage(host.ctx, ui, { admin: true });
		expect(host.calls()).toBeLessThanOrEqual(BUDGET);
	});

	it("opens the editor panel and creates a translation from it", async () => {
		const loaded = countingHost(configured);
		await handlePanel(undefined, panelUi as never, loaded.ctx);
		expect(loaded.calls()).toBeLessThanOrEqual(BUDGET);

		const created = countingHost({ targetLocales: "fr" });
		const response = await handlePanel({ type: "block_action", action_id: "create", value: "fr" }, panelUi as never, created.ctx);
		expect(response.toast).toMatchObject({ type: "success" });
		expect(created.calls()).toBeLessThanOrEqual(BUDGET);
	});

	it.each([
		["saving the settings form", { type: "form_submit", action_id: "save", block_id: "settings", values: { provider: "cloudflare", cloudflareApiToken: "token", cloudflareAccountId: "0123456789abcdef0123456789abcdef", cloudflareGatewayId: "default", formality: "less", instructions: "Keep product names" } }],
		["adding a language", { type: "block_action", action_id: "add-locale", value: "it" }],
		["removing a language", { type: "block_action", action_id: "remove-locale", value: "en" }],
		["removing the saved keys", { type: "block_action", action_id: "forget-keys", value: "forget-keys" }],
	])("answers %s with three collections", async (_name, interaction) => {
		const host = countingHost(configured);
		const route = plugin.routes!.admin!;
		const handler = typeof route === "function" ? route : route.handler;
		const response = await handler({ input: { ...interaction, page: "/translations" }, user: { role: 50 }, ui: { locale: "en" } } as never, host.ctx);
		expect(response).toMatchObject({ toast: { type: "success" } });
		expect(host.calls()).toBeLessThanOrEqual(BUDGET);
	});
});
