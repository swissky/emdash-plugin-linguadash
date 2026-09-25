import type { PluginContext } from "emdash/plugin";

import { applySegments, escapeXml, extractSegments, unescapeXml, type PortableTextNode } from "./portable-text.js";

export type Provider = "deepl" | "openai";

export interface ProviderConfig {
	provider: Provider;
	apiKey: string;
	model: string;
	formality: "default" | "more" | "less";
}

export const PROVIDER_NAMES: Record<Provider, string> = { deepl: "DeepL", openai: "GPT" };

export class ProviderError extends Error {
	override name = "ProviderError";
}

const BATCH_SIZE = 50;

export async function readProviderConfig(ctx: PluginContext): Promise<ProviderConfig | null> {
	const [provider, deeplKey, openaiKey, model, formality] = await Promise.all([
		ctx.settings.get<string>("provider"),
		ctx.settings.get<string>("deeplApiKey"),
		ctx.settings.get<string>("openaiApiKey"),
		ctx.settings.get<string>("openaiModel"),
		ctx.settings.get<string>("formality"),
	]);
	const apiKey = provider === "deepl" ? deeplKey : provider === "openai" ? openaiKey : undefined;
	if ((provider !== "deepl" && provider !== "openai") || !apiKey?.trim()) return null;
	return {
		provider,
		apiKey: apiKey.trim(),
		model: model?.trim() || "gpt-4.1-mini",
		formality: formality === "more" || formality === "less" ? formality : "default",
	};
}

type FieldPlan = { field: string; kind: "text" } | { field: string; kind: "portableText"; count: number };

interface SchemaField {
	slug: string;
	type: string;
}

/** Collects one XML segment per text field and per Portable Text block, in field order. */
export function collectSegments(fields: readonly SchemaField[], data: Record<string, unknown>) {
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
	return { segments, plans };
}

/** Writes translated segments back into a copy of `data`; throws `SegmentMismatchError` on damaged markup. */
export function applyTranslations(
	plans: readonly FieldPlan[],
	translated: readonly string[],
	data: Record<string, unknown>,
): Record<string, unknown> {
	const result = { ...data };
	let next = 0;
	for (const plan of plans) {
		if (plan.kind === "text") {
			result[plan.field] = unescapeXml((translated[next++] ?? "").replace(/<[^>]*>/g, ""));
		} else {
			const slice = translated.slice(next, next + plan.count);
			next += plan.count;
			result[plan.field] = applySegments(data[plan.field] as PortableTextNode[], slice);
		}
	}
	return result;
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

async function callOpenAi(ctx: PluginContext, config: ProviderConfig, texts: string[], from: string, to: string) {
	const tone =
		config.formality === "more" ? " Use a formal tone." : config.formality === "less" ? " Use an informal tone." : "";
	const response = await ctx.http!.fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			model: config.model,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: OPENAI_PROMPT + tone },
				{ role: "user", content: JSON.stringify({ from, to, segments: texts }) },
			],
		}),
	});
	if (!response.ok) throw new ProviderError(`OpenAI responded with ${response.status}`);
	const json = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
	const content = json.choices?.[0]?.message?.content;
	let parsed: unknown;
	try {
		parsed = typeof content === "string" ? JSON.parse(content) : null;
	} catch {
		parsed = null;
	}
	const segments = (parsed as { segments?: unknown } | null)?.segments;
	if (!Array.isArray(segments) || segments.length !== texts.length || !segments.every((s) => typeof s === "string")) {
		throw new ProviderError("OpenAI returned an unexpected response");
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
	const call = config.provider === "deepl" ? callDeepl : callOpenAi;
	const out: string[] = [];
	for (let i = 0; i < segments.length; i += BATCH_SIZE) {
		// oxlint-disable-next-line no-await-in-loop -- providers rate-limit parallel requests
		out.push(...(await call(ctx, config, segments.slice(i, i + BATCH_SIZE), from, to)));
	}
	return out;
}
