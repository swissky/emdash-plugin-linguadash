import type { Block } from "@emdash-cms/blocks";
import type { PluginContext } from "emdash/plugin";

import type { Ui } from "./i18n.js";
import { parseLocales, resolveSourceLocale, resolveTargetLocales, translatableFields } from "./panel.js";
import {
	ACCOUNT_ID,
	DEFAULT_CLOUDFLARE_MODEL,
	GATEWAY_ID,
	PROVIDER_NAMES,
	ProviderError,
	readProviderConfig,
	translateSegments,
	type Provider,
} from "./translate.js";

/** EmDash's admin role; plugin settings are site configuration, like the core settings form. */
export const ADMIN_ROLE = 50;

const LOCALE = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i;
const SECRET_KEYS = ["deeplApiKey", "openaiApiKey", "cloudflareApiToken"] as const;
const PROVIDERS = ["none", "deepl", "openai", "cloudflare"] as const;
/** Sent with every request, so it costs tokens on each translation. */
const MAX_INSTRUCTIONS = 1000;
/** Codes offered when adding a language; a saved code outside this list still shows and can be removed. */
const LANGUAGES = (
	"af am ar az be bg bn bs ca cs cy da de el en es et eu fa fi fil fr ga gl gu he hi hr hu hy id is it ja ka " +
	"kk km kn ko ky lb lo lt lv mk ml mn mr ms mt my nb ne nl nn pa pl ps pt rm ro ru si sk sl so sq sr sv sw " +
	"ta te th tk tr uk ur uz vi zh zu de-at de-ch en-gb en-us es-mx fr-ca fr-ch it-ch pt-br pt-pt zh-hans zh-hant"
).split(" ");

type Choice = (typeof PROVIDERS)[number];

async function text(ctx: PluginContext, key: string): Promise<string> {
	const value = await ctx.settings.get<string>(key);
	return typeof value === "string" ? value : "";
}

async function selectedProvider(ctx: PluginContext): Promise<Choice> {
	const value = await text(ctx, "provider");
	return (PROVIDERS as readonly string[]).includes(value) ? (value as Choice) : "none";
}

/** What the overview's setup checklist and the settings tab report. */
export async function setupStatus(ctx: PluginContext) {
	const sourceLocale = await resolveSourceLocale(ctx);
	const [targetLocales, provider, config, collections] = await Promise.all([
		resolveTargetLocales(ctx, sourceLocale),
		selectedProvider(ctx),
		readProviderConfig(ctx),
		ctx.schema?.listCollections() ?? Promise.resolve([]),
	]);
	return {
		sourceLocale,
		targetLocales,
		provider,
		providerReady: provider !== "none" && config !== null,
		translatableCollections: collections.filter((c) => translatableFields(c).length > 0).map((c) => c.label || c.slug),
	};
}

export type SetupStatus = Awaited<ReturnType<typeof setupStatus>>;

export function providerSummary(status: SetupStatus, { m }: Ui): string {
	if (status.provider === "none") return m.machineOff;
	const name = PROVIDER_NAMES[status.provider];
	return status.providerReady ? m.machineReady(name) : m.machineMissing(name);
}

/** A submission that failed validation: shown again with its error, keeping what was typed. */
export interface RejectedForm {
	error: string;
	values: Record<string, unknown>;
}

export async function settingsBlocks(
	ctx: PluginContext,
	ui: Ui,
	status: SetupStatus,
	rejected?: RejectedForm,
): Promise<Block[]> {
	const { m } = ui;
	const value = (key: string) => {
		const typed = rejected?.values[key];
		return typeof typed === "string" ? typed : text(ctx, key);
	};
	const [formality, instructions, openaiModel, accountId, gatewayId, cloudflareModel] = await Promise.all([
		value("formality"),
		value("instructions"),
		value("openaiModel"),
		value("cloudflareAccountId"),
		value("cloudflareGatewayId"),
		value("cloudflareModel"),
	]);
	const label = (code: string) => `${ui.label(code)} (${code})`;
	const addable = LANGUAGES.filter((code) => code !== status.sourceLocale && !status.targetLocales.includes(code))
		.map((code) => ({ value: code, label: label(code) }))
		.sort((a, b) => a.label.localeCompare(b.label));
	const typedProvider = rejected?.values.provider;
	const provider = (PROVIDERS as readonly unknown[]).includes(typedProvider) ? (typedProvider as Choice) : status.provider;
	const saved = Object.fromEntries(
		await Promise.all(SECRET_KEYS.map(async (key) => [key, (await text(ctx, key)) !== ""] as const)),
	) as Record<(typeof SECRET_KEYS)[number], boolean>;
	const only = (provider: Provider) => ({ field: "provider", eq: provider });

	const blocks: Block[] = [
		{ type: "context", text: m.sourceInfo(label(status.sourceLocale)) },
		{ type: "header", text: m.targetLabel },
		...status.targetLocales.map(
			(code): Block => ({
				type: "section",
				text: label(code),
				accessory: { type: "button", action_id: "remove-locale", label: m.remove, value: code },
			}),
		),
		...(status.targetLocales.length === 0 ? [{ type: "context", text: m.noTargets } satisfies Block] : []),
		{
			type: "actions",
			elements: [
				{
					type: "combobox",
					action_id: "add-locale",
					label: m.addLanguage,
					placeholder: m.searchLanguage,
					options: addable,
				},
			],
		},
		{ type: "context", text: m.targetHelp },
		{ type: "header", text: m.providerLabel },
	];
	if (status.provider !== "none" && !status.providerReady) {
		blocks.push({
			type: "banner",
			variant: "alert",
			title: m.notReadyTitle(PROVIDER_NAMES[status.provider]),
			description: m.notReadyText,
		});
	}
	blocks.push(
		...(rejected ? [{ type: "banner", variant: "error", title: rejected.error } satisfies Block] : []),
		{
			type: "form",
			block_id: "settings",
			fields: [
				{
					type: "radio",
					action_id: "provider",
					label: m.providerChoice,
					options: [
						{ value: "none", label: m.providerOff },
						{ value: "deepl", label: PROVIDER_NAMES.deepl },
						{ value: "openai", label: PROVIDER_NAMES.openai },
						{ value: "cloudflare", label: PROVIDER_NAMES.cloudflare },
					],
					initial_value: provider,
				},
				{
					type: "secret_input",
					action_id: "deeplApiKey",
					label: m.deeplKey,
					has_value: saved.deeplApiKey,
					condition: only("deepl"),
				},
				{
					type: "secret_input",
					action_id: "openaiApiKey",
					label: m.openaiKey,
					has_value: saved.openaiApiKey,
					condition: only("openai"),
				},
				{
					type: "text_input",
					action_id: "openaiModel",
					label: m.openaiModel,
					placeholder: "gpt-4.1-mini",
					initial_value: openaiModel,
					condition: only("openai"),
				},
				{
					type: "text_input",
					action_id: "cloudflareAccountId",
					label: m.cfAccount,
					placeholder: m.cfAccountPlaceholder,
					initial_value: accountId,
					condition: only("cloudflare"),
				},
				{
					type: "secret_input",
					action_id: "cloudflareApiToken",
					label: m.cfToken,
					has_value: saved.cloudflareApiToken,
					condition: only("cloudflare"),
				},
				{
					type: "text_input",
					action_id: "cloudflareGatewayId",
					label: m.cfGateway,
					placeholder: "default",
					initial_value: gatewayId,
					condition: only("cloudflare"),
				},
				{
					type: "text_input",
					action_id: "cloudflareModel",
					label: m.cfModel,
					placeholder: DEFAULT_CLOUDFLARE_MODEL,
					initial_value: cloudflareModel,
					condition: only("cloudflare"),
				},
				{
					type: "radio",
					action_id: "formality",
					label: m.tone,
					options: [
						{ value: "default", label: m.toneDefault },
						{ value: "more", label: m.toneFormal },
						{ value: "less", label: m.toneInformal },
					],
					initial_value: formality || "default",
					condition: { field: "provider", neq: "none" },
				},
				{
					type: "text_input",
					action_id: "instructions",
					label: m.instructions,
					placeholder: m.instructionsPlaceholder,
					initial_value: instructions,
					multiline: true,
					condition: { field: "provider", neq: "none" },
				},
			],
			submit: { label: m.save, action_id: "save" },
		},
	);

	const actions: Extract<Block, { type: "actions" }>["elements"] = [];
	if (status.providerReady) {
		actions.push({ type: "button", action_id: "test", label: m.test, value: "test" });
	}
	if (Object.values(saved).some(Boolean)) {
		actions.push({
			type: "button",
			action_id: "forget-keys",
			label: m.forgetKeys,
			value: "forget-keys",
			style: "danger",
			confirm: { title: m.forgetTitle, text: m.forgetText, confirm: m.forgetConfirm, deny: m.cancel, style: "danger" },
		});
	}
	if (actions.length > 0) blocks.push({ type: "actions", elements: actions });
	return blocks;
}

/** Adds or removes one target language; returns an error message for a code that isn't a locale. */
export async function changeLocale(ctx: PluginContext, action: "add" | "remove", code: string, { m }: Ui) {
	const locale = code.trim().toLowerCase();
	if (!LOCALE.test(locale)) return m.invalidLocale(code);
	const current = parseLocales(await ctx.settings.get<string>("targetLocales"));
	const next = action === "add" ? [...new Set([...current, locale])] : current.filter((c) => c !== locale);
	await ctx.settings.set("targetLocales", next.join(", "));
	return null;
}

/** Validates and stores a settings form submission; returns an error message instead of saving on bad input. */
export async function saveSettings(ctx: PluginContext, values: Record<string, unknown>, { m }: Ui): Promise<string | null> {
	const read = (key: string) => (typeof values[key] === "string" ? (values[key] as string).trim() : "");
	const provider = read("provider") || "none";
	if (!(PROVIDERS as readonly string[]).includes(provider)) return m.chooseProvider;
	const accountId = read("cloudflareAccountId");
	if (accountId && !ACCOUNT_ID.test(accountId)) return m.badAccount;
	const gatewayId = read("cloudflareGatewayId");
	if (gatewayId && !GATEWAY_ID.test(gatewayId)) return m.badGateway;
	const formality = read("formality");
	const instructions = read("instructions");
	if (instructions.length > MAX_INSTRUCTIONS) return m.instructionsTooLong(MAX_INSTRUCTIONS);

	const plain: Record<string, string> = {
		provider,
		formality: formality === "more" || formality === "less" ? formality : "default",
		instructions,
		openaiModel: read("openaiModel"),
		cloudflareAccountId: accountId,
		cloudflareGatewayId: gatewayId,
		cloudflareModel: read("cloudflareModel"),
	};
	// An untouched secret field is omitted and a cleared one is empty; neither replaces the stored key.
	// Secrets go first so a missing encryption key rejects the whole submission.
	try {
		await Promise.all(SECRET_KEYS.map((key) => (read(key) ? ctx.settings.set(key, read(key)) : undefined)));
	} catch (error) {
		if (error instanceof Error && error.message.includes("EMDASH_ENCRYPTION_KEY")) return m.needsEncryptionKey;
		throw error;
	}
	await Promise.all(Object.entries(plain).map(([key, value]) => ctx.settings.set(key, value)));
	return null;
}

export async function forgetKeys(ctx: PluginContext): Promise<void> {
	await Promise.all(SECRET_KEYS.map((key) => ctx.settings.delete(key)));
}

/** Translates a short sample with the saved provider, so setup problems surface before real content. */
export async function testTranslation(ctx: PluginContext, ui: Ui): Promise<{ ok: boolean; message: string }> {
	const config = await readProviderConfig(ctx);
	if (!config) return { ok: false, message: ui.m.testNeedsProvider };
	const status = await setupStatus(ctx);
	const target = status.targetLocales[0] ?? (status.sourceLocale === "en" ? "de" : status.sourceLocale);
	try {
		const [result] = await translateSegments(ctx, config, ["Good morning, and welcome."], "en", target);
		return { ok: true, message: ui.m.testOk(PROVIDER_NAMES[config.provider], result ?? "", ui.language(target)) };
	} catch (error) {
		if (error instanceof ProviderError) return { ok: false, message: error.message };
		throw error;
	}
}
