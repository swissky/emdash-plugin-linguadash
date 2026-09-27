import type { PluginContext } from "emdash/plugin";

import { applySegments, escapeXml, extractSegments, unescapeXml, type PortableTextNode } from "./portable-text.js";

export type Provider = "deepl" | "openai" | "cloudflare";

export interface ProviderConfig {
	provider: Provider;
	apiKey: string;
	model: string;
	formality: "default" | "more" | "less";
	/** Site-specific guidance from the settings: DeepL receives it as `context`, chat models as instructions. */
	instructions: string;
	/** Cloudflare only. */
	accountId?: string;
	gatewayId?: string;
}

export const PROVIDER_NAMES: Record<Provider, string> = {
	deepl: "DeepL",
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
			const apiKey = await setting("deeplApiKey");
			return apiKey ? { provider, apiKey, model: "", formality: tone, instructions } : null;
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

async function callDeepl(ctx: PluginContext, config: ProviderConfig, texts: string[], from: string, to: string) {
	const host = config.apiKey.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
	const body: Record<string, unknown> = {
		text: texts,
		source_lang: deeplSourceLang(from),
		target_lang: deeplTargetLang(to),
		tag_handling: "xml",
	};
	if (config.formality !== "default") body.formality = `prefer_${config.formality}`;
	if (config.instructions) body.context = config.instructions;
	const response = await ctx.http!.fetch(`https://${host}/v2/translate`, {
		method: "POST",
		headers: { Authorization: `DeepL-Auth-Key ${config.apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) throw new ProviderError(`DeepL responded with ${response.status}`);
	const json = (await response.json()) as { translations?: { text?: unknown }[] };
	const out = (json.translations ?? []).map((t) => (typeof t.text === "string" ? t.text : ""));
	if (out.length !== texts.length) throw new ProviderError("DeepL returned an unexpected number of texts");
	return out;
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
	const call = config.provider === "deepl" ? callDeepl : callChat;
	const batches: string[][] = [];
	for (let i = 0; i < segments.length; i += BATCH_SIZE) batches.push(segments.slice(i, i + BATCH_SIZE));
	// Parallel, because the sandbox ends a plugin request after 30 seconds.
	const results = await Promise.all(batches.map((batch) => call(ctx, config, batch, from, to)));
	return results.flat();
}
