import { describe, expect, it } from "vitest";

import { fallbackNotice, nativeLanguageName, switcherLinks } from "../astro/links.js";

describe("switcherLinks", () => {
	const homeHref = (locale: string) => (locale === "de" ? "/" : `/${locale}/`);

	it("links translations and falls back to the homepage for untranslated locales", () => {
		const links = switcherLinks({
			locales: ["de", "fr", "it"],
			currentLocale: "fr",
			alternates: [
				{ hreflang: "de", href: "https://example.com/blog/hallo" },
				{ hreflang: "fr", href: "https://example.com/fr/blog/bonjour" },
				{ hreflang: "x-default", href: "https://example.com/blog/hallo" },
			],
			homeHref,
		});

		expect(links).toEqual([
			{ locale: "de", href: "/blog/hallo", label: "Deutsch", current: false, translated: true },
			{ locale: "fr", href: "/fr/blog/bonjour", label: "Français", current: true, translated: true },
			{ locale: "it", href: "/it/", label: "Italiano", current: false, translated: false },
		]);
	});

	it("marks homepage links on an entry without translations as untranslated", () => {
		const links = switcherLinks({ locales: ["de", "fr"], currentLocale: "de", alternates: [], homeHref });
		expect(links.map((link) => [link.href, link.translated])).toEqual([
			["/", false],
			["/fr/", false],
		]);
	});

	it("links homepages as translated on pages that are not entries", () => {
		const links = switcherLinks({
			locales: ["de", "fr"],
			currentLocale: "de",
			alternates: undefined,
			homeHref,
		});
		expect(links.map((link) => [link.href, link.translated])).toEqual([
			["/", true],
			["/fr/", true],
		]);
	});

	it("uses custom labels", () => {
		const [link] = switcherLinks({
			locales: ["de"],
			currentLocale: "de",
			alternates: [],
			homeHref,
			labels: { de: "DE" },
		});
		expect(link?.label).toBe("DE");
	});
});

describe("nativeLanguageName", () => {
	it("returns the code for an invalid locale", () => {
		expect(nativeLanguageName("not a locale")).toBe("not a locale");
	});
});

describe("fallbackNotice", () => {
	it("writes the notice in the requested language", () => {
		expect(fallbackNotice("missing", "fr", "de")).toBe(
			"Cette page n'est pas encore disponible en français. Vous lisez la version en allemand.",
		);
		expect(fallbackNotice("missing", "de-CH", "en")).toContain("Angezeigt wird die Version auf Englisch.");
	});

	it("falls back to English for languages without built-in text", () => {
		expect(fallbackNotice("missing", "es", "de")).toBe(
			"This page isn't available in Spanish yet. You're reading the German version.",
		);
	});

	it("invites the visitor to an existing translation", () => {
		expect(fallbackNotice("available", "fr", "de")).toBe("Lire cette page en français.");
	});

	it("uses a custom message", () => {
		expect(fallbackNotice("missing", "it", "de", "{fallback} → {requested}")).toBe("tedesco → italiano");
	});
});
