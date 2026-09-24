import { describe, expect, it } from "vitest";

import {
	applySegments,
	extractSegments,
	SegmentMismatchError,
	type PortableTextNode,
} from "../src/portable-text.js";

const doc: PortableTextNode[] = [
	{
		_type: "block",
		_key: "b1",
		style: "h2",
		markDefs: [],
		children: [{ _type: "span", _key: "b1s1", text: "Willkommen", marks: [] }],
	},
	{
		_type: "block",
		_key: "b2",
		style: "normal",
		markDefs: [{ _type: "link", _key: "l1", href: "https://example.com" }],
		children: [
			{ _type: "span", _key: "b2s1", text: "Lies den ", marks: [] },
			{ _type: "span", _key: "b2s2", text: "Artikel", marks: ["l1", "strong"] },
			{ _type: "inlineIcon", _key: "b2i1", name: "star" },
			{ _type: "span", _key: "b2s3", text: " über A & B <heute>.", marks: [] },
		],
	},
	{ _type: "image", _key: "img1", asset: { _ref: "media-1" }, alt: "Ein Bild" },
	{
		_type: "block",
		_key: "b3",
		listItem: "bullet",
		level: 1,
		children: [{ _type: "span", _key: "b3s1", text: "  ", marks: [] }],
	},
];

describe("Portable Text segments", () => {
	it("round-trips a document unchanged", () => {
		const segments = extractSegments(doc);
		expect(segments).toEqual([
			"Willkommen",
			'Lies den <s i="1">Artikel</s><x i="2"/> über A &amp; B &lt;heute&gt;.',
		]);
		expect(applySegments(doc, segments)).toEqual(doc);
	});

	it("keeps marks, link definitions and inline objects when the translation reorders them", () => {
		const [, block] = applySegments(doc, [
			"Welcome",
			'Read <x i="2"/>the <s i="1">article</s> about A &amp; B &lt;today&gt;.',
		]);
		expect(block).toMatchObject({
			markDefs: [{ _key: "l1", href: "https://example.com" }],
			children: [
				{ _key: "b2s1", text: "Read ", marks: [] },
				{ _key: "b2i1", _type: "inlineIcon" },
				{ _key: "b2s3", text: "the " },
				{ _key: "b2s2", text: "article", marks: ["l1", "strong"] },
				{ _type: "span", text: " about A & B <today>.", marks: [] },
			],
		});
		const keys = (block?.children as PortableTextNode[]).map((c) => c._key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("accepts the tag spellings translation APIs return", () => {
		const [, block] = applySegments(doc, ["Welcome", "Read <s i='1'>it</s><x i=\"2\" ></x>"]);
		expect(block?.children).toHaveLength(3);
	});

	it.each([
		["a dropped tag", ["Welcome", "Read the article."]],
		["a duplicated tag", ["Welcome", '<s i="1">a</s><s i="1">b</s><x i="2"/>']],
		["a tag for an unmarked span", ["Welcome", '<s i="0">x</s><s i="1">a</s><x i="2"/>']],
		["an unknown tag", ["Welcome", '<s i="1">a</s><x i="2"/><b>x</b>']],
		["a missing segment", ["Welcome"]],
		["an extra segment", ["Welcome", '<s i="1">a</s><x i="2"/>', "extra"]],
	])("rejects %s", (_name, segments) => {
		expect(() => applySegments(doc, segments)).toThrow(SegmentMismatchError);
	});
});
