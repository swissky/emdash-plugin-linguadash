import type { PluginContext } from "emdash/plugin";

import { applySegments, escapeXml, extractSegments, unescapeXml, type PortableTextNode } from "./portable-text.js";

export type Provider = "deepl" | "google" | "azure" | "openai" | "cloudflare";

export interface ProviderConfig {
	provider: Provider;
	apiKey: string;
	model: string;
	/** DeepL and chat models only. */
	formality: "default" | "more" | "less";
	/**
	 * Site-specific guidance from the settings. DeepL receives it as `context`, and also as
	 * `custom_instructions` where the target language supports them; chat models receive it as instructions.
	 */
	instructions: string;
	/** DeepL only. */
	glossaryIds?: string[];
	/** Azure only; empty for a global Translator resource. */
	region?: string;
	/** Cloudflare only. */
	accountId?: string;
	gatewayId?: string;
}

export const PROVIDER_NAMES: Record<Provider, string> = {
	deepl: "DeepL",
	google: "Google Cloud Translation",
	azure: "Azure Translator",
	openai: "OpenAI",
	cloudflare: "Cloudflare AI Gateway",
};

export const DEFAULT_CLOUDFLARE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export class ProviderError extends Error {
	override name = "ProviderError";
}

const BATCH_SIZE = 50;
export const ACCOUNT_ID = /^[0-9a-f]{32}$/i;
export const GATEWAY_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
export const GLOSSARY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_GLOSSARIES = 5;
export const AZURE_REGION = /^[a-z0-9-]{2,40}$/i;

export function parseGlossaryIds(value: string): string[] {
	return value.split(/[\s,]+/).filter(Boolean);
}

export async function readProviderConfig(ctx: PluginContext): Promise<ProviderConfig | null> {
	const setting = async (key: string) => ((await ctx.settings.get<string>(key)) ?? "").trim();
	const [provider, formality, instructions] = await Promise.all([
		setting("provider"),
		setting("formality"),
		setting("instructions"),
	]);
	const tone = formality === "more" || formality === "less" ? formality : "default";
	switch (provider) {
		case "deepl": {
			const [apiKey, glossaries] = await Promise.all([setting("deeplApiKey"), setting("deeplGlossaryIds")]);
			const glossaryIds = parseGlossaryIds(glossaries);
			return apiKey ? { provider, apiKey, model: "", formality: tone, instructions, glossaryIds } : null;
		}
		case "google": {
			const apiKey = await setting("googleApiKey");
			return apiKey ? { provider, apiKey, model: "", formality: tone, instructions } : null;
		}
		case "azure": {
			const [apiKey, region] = await Promise.all([setting("azureApiKey"), setting("azureRegion")]);
			return apiKey ? { provider, apiKey, model: "", formality: tone, instructions, region } : null;
		}
		case "openai": {
			const [apiKey, model] = await Promise.all([setting("openaiApiKey"), setting("openaiModel")]);
			return apiKey ? { provider, apiKey, model: model || "gpt-4.1-mini", formality: tone, instructions } : null;
		}
		case "cloudflare": {
			const [apiKey, accountId, gatewayId, model] = await Promise.all([
				setting("cloudflareApiToken"),
				setting("cloudflareAccountId"),
				setting("cloudflareGatewayId"),
				setting("cloudflareModel"),
			]);
			if (!apiKey || !accountId) return null;
			return {
				provider,
				apiKey,
				model: model || DEFAULT_CLOUDFLARE_MODEL,
				formality: tone,
				instructions,
				accountId,
				gatewayId: gatewayId || "default",
			};
		}
		default:
			return null;
	}
}

/** SEO text that gets translated along with the content fields. */
export interface SeoText {
	title?: string | null;
	description?: string | null;
}

type FieldPlan =
	| { field: string; kind: "text" }
	| { field: string; kind: "portableText"; count: number }
	| { field: "title" | "description"; kind: "seo" };

interface SchemaField {
	slug: string;
	type: string;
}

/** Collects one XML segment per text field, per Portable Text block and per SEO text, in that order. */
export function collectSegments(fields: readonly SchemaField[], data: Record<string, unknown>, seo?: SeoText) {
	const segments: string[] = [];
	const plans: FieldPlan[] = [];
	for (const field of fields) {
		const value = data[field.slug];
		if ((field.type === "string" || field.type === "text") && typeof value === "string" && value.trim()) {
			segments.push(escapeXml(value));
			plans.push({ field: field.slug, kind: "text" });
		} else if (field.type === "portableText" && Array.isArray(value)) {
			const blockSegments = extractSegments(value as PortableTextNode[]);
			if (blockSegments.length === 0) continue;
			segments.push(...blockSegments);
			plans.push({ field: field.slug, kind: "portableText", count: blockSegments.length });
		}
	}
	for (const key of ["title", "description"] as const) {
		const value = seo?.[key];
		if (typeof value === "string" && value.trim()) {
			segments.push(escapeXml(value));
			plans.push({ field: key, kind: "seo" });
		}
	}
	return { segments, plans };
}

function plainText(segment: string | undefined): string {
	return unescapeXml((segment ?? "").replace(/<[^>]*>/g, ""));
}

/**
 * Writes translated segments back into copies of `data` and `seo`; throws `SegmentMismatchError`
 * on damaged markup.
 */
export function applyTranslations(
	plans: readonly FieldPlan[],
	translated: readonly string[],
	data: Record<string, unknown>,
	seo: SeoText = {},
): { data: Record<string, unknown>; seo: SeoText } {
	const result = { ...data };
	const seoResult = { ...seo };
	let next = 0;
	for (const plan of plans) {
		switch (plan.kind) {
			case "text":
				result[plan.field] = plainText(translated[next++]);
				break;
			case "seo":
				seoResult[plan.field] = plainText(translated[next++]);
				break;
			case "portableText": {
				const slice = translated.slice(next, next + plan.count);
				next += plan.count;
				result[plan.field] = applySegments(data[plan.field] as PortableTextNode[], slice);
				break;
			}
			default: {
				const unhandled: never = plan;
				throw new Error(`Unknown field plan ${JSON.stringify(unhandled)}`);
			}
		}
	}
	return { data: result, seo: seoResult };
}

export function deeplTargetLang(locale: string): string {
	const [base = "", region] = locale.toLowerCase().split(/[-_]/);
	if (region) return `${base}-${region}`.toUpperCase();
	if (base === "en") return "EN-GB";
	if (base === "pt") return "PT-PT";
	return base.toUpperCase();
}

export function deeplSourceLang(locale: string): string {
	return (locale.split(/[-_]/)[0] ?? locale).toUpperCase();
}

type BatchCall = (texts: string[]) => Promise<string[]>;

/** Target languages that accept DeepL `custom_instructions`, with their regional variants. */
const DEEPL_INSTRUCTION_LANGUAGES = new Set(["de", "en", "es", "fr", "it", "ja", "ko", "zh"]);

/** One DeepL custom instruction per non-empty line, or null when the text doesn't fit DeepL's limits. */
export function deeplCustomInstructions(instructions: string, to: string): string[] | null {
	if (!DEEPL_INSTRUCTION_LANGUAGES.has(to.toLowerCase().split(/[-_]/)[0] ?? "")) return null;
	const lines = instructions
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length === 0 || lines.length > 10 || lines.some((line) => line.length > 300)) return null;
	return lines;
}

/** The selected glossaries that hold a dictionary for this language pair; DeepL rejects the others. */
async function deeplGlossaries(ctx: PluginContext, config: ProviderConfig, host: string, from: string, to: string) {
	const source = deeplSourceLang(from).toLowerCase();
	const target = deeplSourceLang(to).toLowerCase();
	const ids = (config.glossaryIds ?? []).filter((id) => GLOSSARY_ID.test(id)).slice(0, MAX_GLOSSARIES);
	const usable = await Promise.all(
		ids.map(async (id) => {
			const response = await ctx.http!.fetch(`https://${host}/v3/glossaries/${id}`, {
				headers: { Authorization: `DeepL-Auth-Key ${config.apiKey}` },
			});
			if (response.status === 404) throw new ProviderError(`DeepL glossary ${id} was not found`);
			if (!response.ok) throw new ProviderError(`DeepL responded with ${response.status}`);
			const json = (await response.json()) as { dictionaries?: { source_lang?: unknown; target_lang?: unknown }[] };
			const matches = (json.dictionaries ?? []).some(
				(d) =>
					String(d.source_lang).toLowerCase() === source &&
					String(d.target_lang).toLowerCase().split("-")[0] === target,
			);
			return matches ? id : null;
		}),
	);
	return usable.filter((id): id is string => id !== null);
}

async function deeplCall(ctx: PluginContext, config: ProviderConfig, from: string, to: string): Promise<BatchCall> {
	const host = config.apiKey.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
	const options: Record<string, unknown> = {
		source_lang: deeplSourceLang(from),
		target_lang: deeplTargetLang(to),
		tag_handling: "xml",
		model_type: "prefer_quality_optimized",
	};
	if (config.formality !== "default") options.formality = `prefer_${config.formality}`;
	if (config.instructions) {
		options.context = config.instructions;
		const custom = deeplCustomInstructions(config.instructions, to);
		if (custom) options.custom_instructions = custom;
	}
	const glossaryIds = await deeplGlossaries(ctx, config, host, from, to);
	if (glossaryIds.length > 0) options.glossary_ids = glossaryIds;
	return async (texts) => {
		const response = await ctx.http!.fetch(`https://${host}/v2/translate`, {
			method: "POST",
			headers: { Authorization: `DeepL-Auth-Key ${config.apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({ text: texts, ...options }),
		});
		if (!response.ok) throw new ProviderError(`DeepL responded with ${response.status}`);
		const json = (await response.json()) as { translations?: { text?: unknown }[] };
		const out = (json.translations ?? []).map((t) => (typeof t.text === "string" ? t.text : ""));
		if (out.length !== texts.length) throw new ProviderError("DeepL returned an unexpected number of texts");
		return out;
	};
}

export function googleLang(locale: string): string {
	const [base = "", region] = locale.toLowerCase().split(/[-_]/);
	if (base === "zh") return region === "hant" || region === "tw" || region === "hk" ? "zh-TW" : "zh-CN";
	if (base === "pt" && region === "pt") return "pt-PT";
	if (base === "fr" && region === "ca") return "fr-CA";
	if (base === "nb") return "no";
	return base;
}

function googleCall(ctx: PluginContext, config: ProviderConfig, from: string, to: string): BatchCall {
	return async (texts) => {
		const response = await ctx.http!.fetch("https://translation.googleapis.com/language/translate/v2", {
			method: "POST",
			headers: { "X-Goog-Api-Key": config.apiKey, "Content-Type": "application/json" },
			body: JSON.stringify({ q: texts, source: googleLang(from), target: googleLang(to), format: "html" }),
		});
		if (!response.ok) throw new ProviderError(`Google Cloud Translation responded with ${response.status}`);
		const json = (await response.json()) as { data?: { translations?: { translatedText?: unknown }[] } };
		const out = (json.data?.translations ?? []).map((t) => (typeof t.translatedText === "string" ? t.translatedText : ""));
		if (out.length !== texts.length) {
			throw new ProviderError("Google Cloud Translation returned an unexpected number of texts");
		}
		return out;
	};
}

export function azureLang(locale: string): string {
	const [base = "", region] = locale.toLowerCase().split(/[-_]/);
	if (base === "zh") return region === "hant" || region === "tw" || region === "hk" ? "zh-Hant" : "zh-Hans";
	if (base === "pt" && region === "pt") return "pt-pt";
	if (base === "fr" && region === "ca") return "fr-ca";
	return base;
}

function azureCall(ctx: PluginContext, config: ProviderConfig, from: string, to: string): BatchCall {
	if (config.region && !AZURE_REGION.test(config.region)) {
		throw new ProviderError("The Azure region may only contain letters, digits and -");
	}
	const query = new URLSearchParams({ "api-version": "3.0", from: azureLang(from), to: azureLang(to), textType: "html" });
	const headers: Record<string, string> = { "Ocp-Apim-Subscription-Key": config.apiKey, "Content-Type": "application/json" };
	if (config.region) headers["Ocp-Apim-Subscription-Region"] = config.region;
	return async (texts) => {
		const response = await ctx.http!.fetch(`https://api.cognitive.microsofttranslator.com/translate?${query}`, {
			method: "POST",
			headers,
			body: JSON.stringify(texts.map((text) => ({ Text: text }))),
		});
		if (!response.ok) throw new ProviderError(`Azure Translator responded with ${response.status}`);
		const json = (await response.json()) as { translations?: { text?: unknown }[] }[];
		const out = (Array.isArray(json) ? json : []).map((item) => {
			const text = item.translations?.[0]?.text;
			return typeof text === "string" ? text : "";
		});
		if (out.length !== texts.length) throw new ProviderError("Azure Translator returned an unexpected number of texts");
		return out;
	};
}

const OPENAI_PROMPT = [
	"You translate website content.",
	"Each item in `segments` is an XML fragment. Keep every <s i=\"…\"> and <x i=\"…\"/> tag with its i attribute exactly once, translate only the text, and keep XML entities escaped.",
	"Reply with a JSON object {\"segments\": [...]} holding the translations in the same order and the same number of items.",
].join(" ");

function chatEndpoint(config: ProviderConfig): { url: string; headers: Record<string, string>; name: string } {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${config.apiKey}`,
		"Content-Type": "application/json",
	};
	if (config.provider !== "cloudflare") {
		return { url: "https://api.openai.com/v1/chat/completions", headers, name: "OpenAI" };
	}
	if (!ACCOUNT_ID.test(config.accountId ?? "")) {
		throw new ProviderError("The Cloudflare account ID should be 32 hexadecimal characters");
	}
	if (!GATEWAY_ID.test(config.gatewayId ?? "")) {
		throw new ProviderError("The AI Gateway ID may only contain letters, digits, - and _");
	}
	headers["cf-aig-gateway-id"] = config.gatewayId!;
	return {
		url: `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/v1/chat/completions`,
		headers,
		name: "Cloudflare AI Gateway",
	};
}

/** Parses `{"segments": [...]}`, also when a model wraps it in a Markdown code fence. */
function parseSegments(content: unknown): unknown {
	if (typeof content !== "string") return null;
	const json = content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
	try {
		return (JSON.parse(json) as { segments?: unknown } | null)?.segments;
	} catch {
		return null;
	}
}

async function callChat(ctx: PluginContext, config: ProviderConfig, texts: string[], from: string, to: string) {
	const { url, headers, name } = chatEndpoint(config);
	const tone =
		config.formality === "more" ? " Use a formal tone." : config.formality === "less" ? " Use an informal tone." : "";
	const instructions = config.instructions
		? ` Follow these instructions from the site, unless they conflict with the rules above: ${config.instructions}`
		: "";
	const response = await ctx.http!.fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify({
			model: config.model,
			// Not every model behind the gateway supports JSON mode; the prompt asks for JSON either way.
			...(config.provider === "openai" ? { response_format: { type: "json_object" } } : {}),
			messages: [
				{ role: "system", content: OPENAI_PROMPT + tone + instructions },
				{ role: "user", content: JSON.stringify({ from, to, segments: texts }) },
			],
		}),
	});
	if (!response.ok) throw new ProviderError(`${name} responded with ${response.status}`);
	const json = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
	const segments = parseSegments(json.choices?.[0]?.message?.content);
	if (!Array.isArray(segments) || segments.length !== texts.length || !segments.every((s) => typeof s === "string")) {
		throw new ProviderError(`${name} returned an unexpected response`);
	}
	return segments as string[];
}

export async function translateSegments(
	ctx: PluginContext,
	config: ProviderConfig,
	segments: readonly string[],
	from: string,
	to: string,
): Promise<string[]> {
	if (!ctx.http) throw new ProviderError("LinguaDash needs the network:request capability");
	const call = await batchCall(ctx, config, from, to);
	const batches: string[][] = [];
	for (let i = 0; i < segments.length; i += BATCH_SIZE) batches.push(segments.slice(i, i + BATCH_SIZE));
	// Parallel, because the sandbox ends a plugin request after 30 seconds.
	const results = await Promise.all(batches.map(call));
	return results.flat();
}

async function batchCall(ctx: PluginContext, config: ProviderConfig, from: string, to: string): Promise<BatchCall> {
	switch (config.provider) {
		case "deepl":
			return deeplCall(ctx, config, from, to);
		case "google":
			return googleCall(ctx, config, from, to);
		case "azure":
			return azureCall(ctx, config, from, to);
		case "openai":
		case "cloudflare":
			return (texts) => callChat(ctx, config, texts, from, to);
		default: {
			const unhandled: never = config.provider;
			throw new Error(`Unknown provider ${String(unhandled)}`);
		}
	}
}
