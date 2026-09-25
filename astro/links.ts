export interface Alternate {
	hreflang: string;
	href: string;
}

export interface SwitcherLink {
	locale: string;
	href: string;
	label: string;
	/** The locale of the page being viewed. */
	current: boolean;
	/** False when the link goes to the locale's homepage because the entry has no translation. */
	translated: boolean;
}

/** A language's name in that language, e.g. "Français" for `fr`. */
export function nativeLanguageName(locale: string): string {
	try {
		const name = new Intl.DisplayNames([locale], { type: "language" }).of(locale);
		if (!name) return locale;
		return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
	} catch {
		return locale;
	}
}

export function toPath(href: string): string {
	if (!URL.canParse(href)) return href;
	const url = new URL(href);
	return `${url.pathname}${url.search}`;
}

/**
 * One link per configured locale: the published translation of the current entry when it
 * exists, otherwise that locale's homepage. Pass `alternates: undefined` on pages that are
 * not content entries; their homepage links count as translated.
 */
export function switcherLinks(options: {
	locales: string[];
	currentLocale: string | undefined;
	alternates: Alternate[] | undefined;
	homeHref: (locale: string) => string;
	labels?: Record<string, string>;
}): SwitcherLink[] {
	const translatedHref = new Map(
		(options.alternates ?? [])
			.filter((alternate) => alternate.hreflang !== "x-default")
			.map((alternate) => [alternate.hreflang, toPath(alternate.href)]),
	);
	return options.locales.map((locale) => {
		const href = translatedHref.get(locale);
		return {
			locale,
			href: href ?? options.homeHref(locale),
			label: options.labels?.[locale] ?? nativeLanguageName(locale),
			current: locale === options.currentLocale,
			translated: href !== undefined || options.alternates === undefined,
		};
	});
}

const NOTICE_MESSAGES = {
	missing: {
		en: "This page isn't available in {requested} yet. You're reading the {fallback} version.",
		de: "Diese Seite gibt es noch nicht auf {requested}. Angezeigt wird die Version auf {fallback}.",
		fr: "Cette page n'est pas encore disponible en {requested}. Vous lisez la version en {fallback}.",
		it: "Questa pagina non è ancora disponibile in {requested}. Stai leggendo la versione in {fallback}.",
	},
	available: {
		en: "Read this page in {requested}.",
		de: "Diese Seite auf {requested} lesen.",
		fr: "Lire cette page en {requested}.",
		it: "Leggi questa pagina in {requested}.",
	},
} satisfies Record<string, Record<string, string>>;

/**
 * Notice text for a page served from a fallback locale, written in the requested locale
 * (English when there is no built-in text for it). `missing` says the translation does not
 * exist; `available` invites the visitor to the translation that does. `message` overrides
 * the built-in text; `{requested}` and `{fallback}` are replaced with language names.
 */
export function fallbackNotice(
	kind: keyof typeof NOTICE_MESSAGES,
	requested: string,
	fallback: string,
	message?: string,
): string {
	const messages: Record<string, string> = NOTICE_MESSAGES[kind];
	const builtIn = messages[requested.split("-")[0]!.toLowerCase()];
	const template = message ?? builtIn ?? messages.en!;
	const textLocale = message || builtIn ? requested : "en";
	let names: Intl.DisplayNames | undefined;
	try {
		names = new Intl.DisplayNames([textLocale], { type: "language" });
	} catch {
		names = undefined;
	}
	const name = (locale: string) => names?.of(locale) ?? locale;
	return template.replaceAll("{requested}", name(requested)).replaceAll("{fallback}", name(fallback));
}
