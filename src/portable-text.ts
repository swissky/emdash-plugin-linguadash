/**
 * Portable Text <-> translation segments.
 *
 * Every text block becomes one XML segment. Marked spans become `<s i="n">text</s>` and inline
 * objects `<x i="n"/>`, where `n` is the child index in the source block; unmarked text stays bare
 * so a translator can reorder words freely. Non-text blocks (images, embeds, custom blocks) and
 * blocks without text are not segmented and are copied verbatim.
 */

export interface PortableTextNode {
	_type: string;
	_key?: string;
	[key: string]: unknown;
}

interface Span extends PortableTextNode {
	_type: "span";
	_key: string;
	text: string;
	marks?: string[];
}

interface Block extends PortableTextNode {
	_type: "block";
	_key: string;
	children: PortableTextNode[];
}

export class SegmentMismatchError extends Error {
	override name = "SegmentMismatchError";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function escapeXml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function unescapeXml(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
		if (name[0] === "#") {
			const code =
				name[1] === "x" || name[1] === "X"
					? Number.parseInt(name.slice(2), 16)
					: Number.parseInt(name.slice(1), 10);
			return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
		}
		return ENTITIES[name.toLowerCase()] ?? entity;
	});
}

function isBlock(node: PortableTextNode): node is Block {
	return node._type === "block" && Array.isArray(node.children);
}

function isSpan(node: PortableTextNode): node is Span {
	return node._type === "span" && typeof node.text === "string";
}

function isMarked(span: Span): boolean {
	return (span.marks?.length ?? 0) > 0;
}

function blockToXml(block: Block): string | null {
	let xml = "";
	let hasText = false;
	block.children.forEach((child, i) => {
		if (!isSpan(child)) {
			xml += `<x i="${i}"/>`;
			return;
		}
		if (child.text.trim()) hasText = true;
		xml += isMarked(child) ? `<s i="${i}">${escapeXml(child.text)}</s>` : escapeXml(child.text);
	});
	return hasText ? xml : null;
}

const TOKEN =
	/<s\s+i=["'](\d+)["']\s*>([^<]*)<\/s>|<x\s+i=["'](\d+)["']\s*(?:\/>|><\/x>)|([^<]+)/y;

function xmlToChildren(xml: string, block: Block): PortableTextNode[] {
	const tagged = new Set<number>();
	block.children.forEach((child, i) => {
		if (!isSpan(child) || isMarked(child)) tagged.add(i);
	});
	const plainSpans = block.children.filter((c): c is Span => isSpan(c) && !isMarked(c));
	const usedKeys = new Set(block.children.map((c) => c._key));
	let plainIndex = 0;
	let generated = 0;

	const nextPlainSpan = (text: string): Span => {
		const original = plainSpans[plainIndex++];
		if (original) return { ...original, text };
		let key: string;
		do key = `${block._key}-${generated++}`;
		while (usedKeys.has(key));
		usedKeys.add(key);
		return { _type: "span", _key: key, text, marks: [] };
	};

	const seen = new Set<number>();
	const claim = (index: number): PortableTextNode => {
		const original = block.children[index];
		if (!original || !tagged.has(index) || seen.has(index)) {
			throw new SegmentMismatchError(`Unexpected tag i="${index}" in block ${block._key}`);
		}
		seen.add(index);
		return original;
	};

	const children: PortableTextNode[] = [];
	TOKEN.lastIndex = 0;
	while (TOKEN.lastIndex < xml.length) {
		const match = TOKEN.exec(xml);
		if (!match) throw new SegmentMismatchError(`Malformed segment for block ${block._key}`);
		const [, spanIndex, spanText, inlineIndex, plainText] = match;
		if (spanIndex !== undefined) {
			children.push({ ...claim(Number(spanIndex)), text: unescapeXml(spanText ?? "") });
		} else if (inlineIndex !== undefined) {
			children.push(claim(Number(inlineIndex)));
		} else if (plainText !== undefined) {
			children.push(nextPlainSpan(unescapeXml(plainText)));
		}
	}
	if (seen.size !== tagged.size) {
		throw new SegmentMismatchError(`Missing tags in block ${block._key}`);
	}
	if (children.length === 0) children.push(nextPlainSpan(""));
	return children;
}

/** Returns one XML segment per translatable text block, in document order. */
export function extractSegments(blocks: readonly PortableTextNode[]): string[] {
	const segments: string[] = [];
	for (const node of blocks) {
		if (!isBlock(node)) continue;
		const xml = blockToXml(node);
		if (xml !== null) segments.push(xml);
	}
	return segments;
}

/**
 * Rebuilds the document with translated segments, in the order returned by `extractSegments`.
 * Throws `SegmentMismatchError` when a segment's tags don't match its source block.
 */
export function applySegments(
	blocks: readonly PortableTextNode[],
	translated: readonly string[],
): PortableTextNode[] {
	let next = 0;
	const result = blocks.map((node) => {
		if (!isBlock(node) || blockToXml(node) === null) return node;
		const xml = translated[next++];
		if (xml === undefined) throw new SegmentMismatchError("Fewer segments than text blocks");
		return { ...node, children: xmlToChildren(xml, node) };
	});
	if (next !== translated.length) {
		throw new SegmentMismatchError("More segments than text blocks");
	}
	return result;
}
