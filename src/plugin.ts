import type { SandboxedPlugin } from "emdash/plugin";

import { handlePanel } from "./panel.js";
import { forgetDeleted, handleOverview, trackSave } from "./status.js";

const plugin: SandboxedPlugin = {
	hooks: {
		"content:afterSave": trackSave,
		"content:afterDelete": forgetDeleted,
	},
	routes: {
		admin: {
			permission: "content:create",
			handler: async (_routeCtx, ctx) => handleOverview(ctx),
		},
		"editor/panel": {
			permission: "content:create",
			handler: async (routeCtx, ctx) => handlePanel(routeCtx.input, routeCtx.ui, ctx),
		},
	},
};

export default plugin;
