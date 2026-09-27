import type { BlockInteraction, BlockResponse } from "@emdash-cms/blocks";
import type { PluginContext, SandboxedPlugin } from "emdash/plugin";

import { requestLocale, uiFor, type Ui } from "./i18n.js";
import { handlePanel } from "./panel.js";
import { ADMIN_ROLE, changeLocale, forgetKeys, saveSettings, testTranslation } from "./settings.js";
import {
	forgetDeleted,
	renderPage,
	trackPublish,
	trackSave,
	TRANSLATE_ACTION,
	translateMissing,
} from "./status.js";

const SETTINGS_ACTIONS = new Set(["save", "test", "forget-keys", "add-locale", "remove-locale"]);

async function handleAdmin(interaction: BlockInteraction, role: number, ui: Ui, ctx: PluginContext): Promise<BlockResponse> {
	const admin = role >= ADMIN_ROLE;
	if (interaction.type === "block_action" && interaction.action_id === TRANSLATE_ACTION) {
		const toast = await translateMissing(ctx, ui, interaction.value);
		return { ...(await renderPage(ctx, ui, { admin })), toast };
	}
	if (interaction.type === "page_load" || !SETTINGS_ACTIONS.has(interaction.action_id)) {
		const tab = interaction.type !== "page_load" && interaction.action_id === "open-settings" ? "settings" : undefined;
		return renderPage(ctx, ui, { admin, tab });
	}
	if (!admin) return { ...(await renderPage(ctx, ui, { admin })), toast: { message: ui.m.adminOnly, type: "error" } };

	let toast: NonNullable<BlockResponse["toast"]>;
	if (interaction.type === "form_submit" && interaction.action_id === "save") {
		const error = await saveSettings(ctx, interaction.values, ui);
		if (error) return renderPage(ctx, ui, { admin, tab: "settings", rejected: { error, values: interaction.values } });
		toast = { message: ui.m.saved, type: "success" };
	} else if (interaction.type === "block_action" && (interaction.action_id === "add-locale" || interaction.action_id === "remove-locale")) {
		const code = typeof interaction.value === "string" ? interaction.value : "";
		if (!code) return renderPage(ctx, ui, { admin, tab: "settings" });
		const adding = interaction.action_id === "add-locale";
		const error = await changeLocale(ctx, adding ? "add" : "remove", code, ui);
		const language = ui.language(code);
		toast = error
			? { message: error, type: "error" }
			: { message: adding ? ui.m.added(language) : ui.m.removed(language), type: "success" };
	} else if (interaction.action_id === "forget-keys") {
		await forgetKeys(ctx);
		toast = { message: ui.m.keysRemoved, type: "success" };
	} else {
		const result = await testTranslation(ctx, ui);
		toast = { message: result.message, type: result.ok ? "success" : "error" };
	}
	return { ...(await renderPage(ctx, ui, { admin, tab: "settings" })), toast };
}

const plugin: SandboxedPlugin = {
	hooks: {
		"content:afterSave": trackSave,
		"content:afterPublish": trackPublish,
		"content:afterDelete": forgetDeleted,
	},
	routes: {
		admin: {
			permission: "content:create",
			handler: async (routeCtx, ctx) =>
				handleAdmin(
					routeCtx.input as BlockInteraction,
					routeCtx.user?.role ?? 0,
					uiFor(routeCtx.ui?.locale ?? requestLocale(routeCtx.request)),
					ctx,
				),
		},
		"editor/panel": {
			permission: "content:create",
			handler: async (routeCtx, ctx) => handlePanel(routeCtx.input, routeCtx.ui, ctx),
		},
	},
};

export default plugin;
