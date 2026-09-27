/** Admin UI text. The host sends the editor's admin language; anything without a catalog gets English. */

const en = {
	tabOverview: "Status",
	tabSettings: "Settings",
	openSettings: "Open settings",

	setupTitle: "Set up translations",
	setupIntro:
		"LinguaDash tracks which entries exist in which language and helps you create the missing ones. Two steps are needed before it can start.",
	stepLanguages: "Languages",
	languagesDone: (source: string, targets: string) => `Translating ${source} into ${targets}.`,
	languagesTodo:
		"Choose the languages to translate into in the Settings tab. They must also be listed in the i18n locales of astro.config.mjs.",
	stepFields: "Translatable fields",
	fieldsDone: (collections: string) => `Enabled in ${collections}.`,
	fieldsTodo:
		"In Content Types, open a collection and switch on “Translatable” for every field that differs per language, such as the title and body.",
	stepMachine: "Machine translation (optional)",
	machineOffHint: "Off. Add a DeepL, OpenAI or Cloudflare AI Gateway key to draft translations automatically.",
	machineOff: "Off",
	machineReady: (name: string) => `${name}, ready`,
	machineMissing: (name: string) => `${name} selected, credentials missing`,
	summary: (source: string, targets: string, machine: string) => `${source} → ${targets} · Machine translation: ${machine}`,

	tabMissing: (count: number) => `Missing (${count})`,
	tabOutdated: (count: number) => `Outdated (${count})`,
	tabReview: (count: number) => `To review (${count})`,
	missingHint: "Language versions that don't exist yet. A draft is the first step.",
	outdatedHint: "The source changed after these were published. Update them and publish them again.",
	reviewHint: "Translation drafts that are not published yet. Check them and publish them.",
	noneMissing: "Every entry exists in all target languages.",
	noneOutdated: "No translation is behind its source.",
	noneReview: "Nothing is waiting for review.",
	showingFirst: (limit: number) => `Showing the first ${limit}.`,
	partialScan: (limit: number) => `Only the first ${limit} entries of each collection were checked.`,
	open: "Open",
	columnMissing: "Missing languages",
	columnLanguage: "Language",
	columnEntry: "Entry",

	adminOnly: "Only administrators can change translation settings.",
	sourceInfo: (language: string) =>
		`Source language: ${language}, the site's default language. Translations are created as separate entries and stay drafts until you publish them.`,
	targetLabel: "Target languages",
	addLanguage: "Add a language",
	searchLanguage: "Search languages…",
	remove: "Remove",
	added: (language: string) => `${language} added`,
	removed: (language: string) => `${language} removed`,
	providerChoice: "Service",
	targetHelp: "Add only languages that are also listed, with the same code, in the i18n locales of astro.config.mjs.",
	providerLabel: "Machine translation",
	providerOff: "Off (translate by hand)",
	deeplKey: "DeepL API key (Free keys end in :fx)",
	openaiKey: "OpenAI API key",
	openaiModel: "OpenAI model",
	cfAccount: "Cloudflare account ID",
	cfAccountPlaceholder: "32 characters, shown in the dashboard sidebar",
	cfToken: "Cloudflare API token (Account > Workers AI > Read)",
	cfGateway: "AI Gateway ID",
	cfModel: "Model",
	tone: "Tone",
	toneDefault: "Default",
	toneFormal: "Formal",
	toneInformal: "Informal",
	instructions: "Instructions for the translation (optional)",
	instructionsPlaceholder: "e.g. Use Swiss spelling (ss instead of ß). Keep product names in English.",
	instructionsTooLong: (max: number) => `Keep the instructions to ${max} characters or fewer.`,
	save: "Save",
	test: "Test machine translation",
	forgetKeys: "Remove saved API keys",
	forgetTitle: "Remove saved API keys?",
	forgetText: "Machine translation stops working until you enter a key again.",
	forgetConfirm: "Remove",
	cancel: "Cancel",
	notReadyTitle: (name: string) => `${name} is selected but not ready`,
	notReadyText: "Enter the missing credentials. Until then no translate button appears.",
	saved: "Settings saved",
	keysRemoved: "API keys removed",
	invalidLocale: (codes: string) => `Not a locale code: ${codes}. Use codes such as de, fr or pt-br.`,
	chooseProvider: "Choose a machine translation option.",
	badAccount: "The Cloudflare account ID has 32 hexadecimal characters.",
	badGateway: "The AI Gateway ID may only contain letters, digits, - and _.",
	needsEncryptionKey:
		"API keys are stored encrypted. Set EMDASH_ENCRYPTION_KEY on the server (generate one with `npx emdash secrets generate`), then save again.",
	testNeedsProvider: "Save a provider and its credentials first.",
	testOk: (name: string, result: string, language: string) => `${name} works: “${result}” (${language})`,

	noTranslatableFields:
		"No field in this collection is marked translatable. Switch on “Translatable” for its fields in Content Types to translate entries.",
	noSource: (language: string) => `This entry has no ${language} version to translate from.`,
	missing: "Missing",
	draft: "Draft",
	done: "Done ✓",
	outdated: "Outdated",
	translate: "Translate",
	retranslate: "Retranslate",
	retranslateTitle: (language: string) => `Retranslate ${language}?`,
	retranslateText: "This replaces the current draft, including any changes made by hand.",
	thisEntry: "this entry",
	translateWith: (name: string) => `Translate with ${name}`,
	createTranslation: "Create draft",
	noTargets: "No target languages chosen yet.",
	created: (language: string) => `${language} draft created from the source`,
	machineDone: (language: string) => `${language} machine translated. Review it before publishing.`,
	nothingToDo: "Nothing to do",
	allLanguages: "All languages",
	createdMany: (count: number) => `${count} drafts created from the source`,
	machineDoneMany: (count: number) => `${count} languages machine translated. Review them before publishing.`,
	providerFailed: (detail: string) => `${detail}. Check the API key in the settings.`,
	formatChanged: "The translation service changed the formatting. Nothing was saved; try again.",
	actionFailed: "The translation could not be updated. Try again.",
};

export type Messages = typeof en;

const de: Messages = {
	tabOverview: "Status",
	tabSettings: "Einstellungen",
	openSettings: "Einstellungen öffnen",

	setupTitle: "Übersetzungen einrichten",
	setupIntro:
		"LinguaDash zeigt, welche Einträge in welcher Sprache vorhanden sind, und hilft beim Anlegen der fehlenden. Dafür braucht es zwei Schritte.",
	stepLanguages: "Sprachen",
	languagesDone: (source, targets) => `Übersetzt wird aus ${source} nach ${targets}.`,
	languagesTodo:
		"Wähle im Tab Einstellungen die Zielsprachen. Sie müssen auch in den i18n-Locales in astro.config.mjs stehen.",
	stepFields: "Übersetzbare Felder",
	fieldsDone: (collections) => `Aktiv in ${collections}.`,
	fieldsTodo:
		"Öffne unter Inhaltstypen eine Kollektion und schalte „Übersetzbar“ für jedes Feld ein, das sich je Sprache unterscheidet, etwa Titel und Text.",
	stepMachine: "Maschinelle Übersetzung (optional)",
	machineOffHint: "Aus. Mit einem Schlüssel für DeepL, OpenAI oder Cloudflare AI Gateway entstehen Übersetzungsentwürfe automatisch.",
	machineOff: "Aus",
	machineReady: (name) => `${name}, bereit`,
	machineMissing: (name) => `${name} gewählt, Zugangsdaten fehlen`,
	summary: (source, targets, machine) => `${source} → ${targets} · Maschinelle Übersetzung: ${machine}`,

	tabMissing: (count) => `Fehlt (${count})`,
	tabOutdated: (count) => `Veraltet (${count})`,
	tabReview: (count) => `Zu prüfen (${count})`,
	missingHint: "Sprachfassungen, die es noch nicht gibt. Ein Entwurf ist der erste Schritt.",
	outdatedHint: "Die Quelle wurde nach dem Publizieren geändert. Passe die Übersetzungen an und publiziere sie erneut.",
	reviewHint: "Übersetzungsentwürfe, die noch nicht publiziert sind. Prüfe und publiziere sie.",
	noneMissing: "Jeder Eintrag existiert in allen Zielsprachen.",
	noneOutdated: "Keine Übersetzung hinkt ihrer Quelle hinterher.",
	noneReview: "Nichts wartet auf eine Prüfung.",
	showingFirst: (limit) => `Die ersten ${limit} werden angezeigt.`,
	partialScan: (limit) => `Geprüft wurden nur die ersten ${limit} Einträge jeder Kollektion.`,
	open: "Öffnen",
	columnMissing: "Fehlende Sprachen",
	columnLanguage: "Sprache",
	columnEntry: "Eintrag",

	adminOnly: "Nur Administratoren können die Übersetzungseinstellungen ändern.",
	sourceInfo: (language) =>
		`Ausgangssprache: ${language}, die Standardsprache der Website. Übersetzungen entstehen als eigene Einträge und bleiben Entwürfe, bis du sie publizierst.`,
	targetLabel: "Zielsprachen",
	addLanguage: "Sprache hinzufügen",
	searchLanguage: "Sprache suchen…",
	remove: "Entfernen",
	added: (language) => `${language} hinzugefügt`,
	removed: (language) => `${language} entfernt`,
	providerChoice: "Dienst",
	targetHelp: "Füge nur Sprachen hinzu, die mit demselben Code auch in den i18n-Locales in astro.config.mjs stehen.",
	providerLabel: "Maschinelle Übersetzung",
	providerOff: "Aus (von Hand übersetzen)",
	deeplKey: "DeepL-API-Schlüssel (Free-Schlüssel enden auf :fx)",
	openaiKey: "OpenAI-API-Schlüssel",
	openaiModel: "OpenAI-Modell",
	cfAccount: "Cloudflare-Konto-ID",
	cfAccountPlaceholder: "32 Zeichen, in der Seitenleiste des Dashboards",
	cfToken: "Cloudflare-API-Token (Account > Workers AI > Read)",
	cfGateway: "AI-Gateway-ID",
	cfModel: "Modell",
	tone: "Anrede",
	toneDefault: "Standard",
	toneFormal: "Formell (Sie)",
	toneInformal: "Informell (du)",
	instructions: "Hinweise für die Übersetzung (optional)",
	instructionsPlaceholder: "z. B. Schweizer Rechtschreibung (ss statt ß). Produktnamen auf Englisch lassen.",
	instructionsTooLong: (max) => `Die Hinweise dürfen höchstens ${max} Zeichen lang sein.`,
	save: "Speichern",
	test: "Maschinelle Übersetzung testen",
	forgetKeys: "Gespeicherte API-Schlüssel entfernen",
	forgetTitle: "Gespeicherte API-Schlüssel entfernen?",
	forgetText: "Die maschinelle Übersetzung funktioniert erst wieder, wenn du einen Schlüssel einträgst.",
	forgetConfirm: "Entfernen",
	cancel: "Abbrechen",
	notReadyTitle: (name) => `${name} ist gewählt, aber nicht bereit`,
	notReadyText: "Trage die fehlenden Zugangsdaten ein. Bis dahin erscheint kein Übersetzen-Button.",
	saved: "Einstellungen gespeichert",
	keysRemoved: "API-Schlüssel entfernt",
	invalidLocale: (codes) => `Kein gültiger Locale-Code: ${codes}. Verwende Codes wie de, fr oder pt-br.`,
	chooseProvider: "Wähle eine Option für die maschinelle Übersetzung.",
	badAccount: "Die Cloudflare-Konto-ID besteht aus 32 hexadezimalen Zeichen.",
	badGateway: "Die AI-Gateway-ID darf nur Buchstaben, Ziffern, - und _ enthalten.",
	needsEncryptionKey:
		"API-Schlüssel werden verschlüsselt gespeichert. Setze EMDASH_ENCRYPTION_KEY auf dem Server (erzeugen mit `npx emdash secrets generate`) und speichere dann erneut.",
	testNeedsProvider: "Speichere zuerst einen Anbieter und seine Zugangsdaten.",
	testOk: (name, result, language) => `${name} funktioniert: „${result}“ (${language})`,

	noTranslatableFields:
		"In dieser Kollektion ist kein Feld als übersetzbar markiert. Schalte unter Inhaltstypen „Übersetzbar“ für die Felder ein, um Einträge zu übersetzen.",
	noSource: (language) => `Dieser Eintrag hat keine Fassung in ${language}, aus der übersetzt werden kann.`,
	missing: "Fehlt",
	draft: "Entwurf",
	done: "Fertig ✓",
	outdated: "Veraltet",
	translate: "Übersetzen",
	retranslate: "Neu übersetzen",
	retranslateTitle: (language) => `${language} neu übersetzen?`,
	retranslateText: "Das ersetzt den aktuellen Entwurf, auch von Hand gemachte Änderungen.",
	thisEntry: "dieser Eintrag",
	translateWith: (name) => `Mit ${name} übersetzen`,
	createTranslation: "Entwurf anlegen",
	noTargets: "Noch keine Zielsprachen gewählt.",
	created: (language) => `Entwurf in ${language} aus der Quelle angelegt`,
	machineDone: (language) => `${language} maschinell übersetzt. Vor dem Publizieren prüfen.`,
	nothingToDo: "Nichts zu tun",
	allLanguages: "Alle Sprachen",
	createdMany: (count) => `${count} Entwürfe aus der Quelle angelegt`,
	machineDoneMany: (count) => `${count} Sprachen maschinell übersetzt. Vor dem Veröffentlichen prüfen.`,
	providerFailed: (detail) => `${detail}. Prüfe den API-Schlüssel in den Einstellungen.`,
	formatChanged: "Der Übersetzungsdienst hat die Formatierung verändert. Nichts wurde gespeichert; bitte erneut versuchen.",
	actionFailed: "Die Übersetzung konnte nicht aktualisiert werden. Bitte erneut versuchen.",
};

const catalogs: Record<string, Messages> = { en, de };

export interface Ui {
	m: Messages;
	/** Locale code as a language name in the admin language, e.g. "fr" → "Französisch". */
	language: (code: string) => string;
	languages: (codes: readonly string[]) => string;
}

const LOCALE_COOKIE = /(?:^|;\s*)emdash-locale=([^;]+)/;

/** The admin language from the request, for hosts that pass no UI context to in-process plugins. */
export function requestLocale(request: { headers: Headers | Record<string, string> } | undefined): string | undefined {
	const headers = request?.headers;
	const header = (name: string) =>
		headers instanceof Headers ? headers.get(name) : (headers?.[name] ?? headers?.[name.toLowerCase()]);
	const cookie = header("cookie")?.match(LOCALE_COOKIE)?.[1]?.trim();
	if (cookie) return cookie;
	return header("accept-language")?.split(",")[0]?.split(";")[0]?.trim() || undefined;
}

export function uiFor(locale: string | undefined): Ui {
	const tag = locale || "en";
	const m = catalogs[tag.toLowerCase().split(/[-_]/)[0]!] ?? en;
	let names: Intl.DisplayNames | null = null;
	try {
		names = new Intl.DisplayNames([tag, "en"], { type: "language" });
	} catch {
		names = null;
	}
	const language = (code: string) => {
		try {
			return names?.of(code.replace("_", "-")) ?? code.toUpperCase();
		} catch {
			return code.toUpperCase();
		}
	};
	return { m, language, languages: (codes) => codes.map(language).join(", ") };
}
