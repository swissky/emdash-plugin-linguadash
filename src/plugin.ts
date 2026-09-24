import type { SandboxedPlugin } from "emdash/plugin";

import { handlePanel } from "./panel.js";

const plugin: SandboxedPlugin = {
	routes: {
		"editor/panel": {
			permission: "content:create",
			handler: async (routeCtx, ctx) => handlePanel(routeCtx.input, routeCtx.ui, ctx),
		},
	},
};

export default plugin;
