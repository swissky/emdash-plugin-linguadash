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
	machineDoneMany: (count) => `${count} Sprachen maschinell übersetzt. Vor dem Publizieren prüfen.`,
	providerFailed: (detail) => `${detail}. Prüfe den API-Schlüssel in den Einstellungen.`,
	formatChanged: "Der Übersetzungsdienst hat die Formatierung verändert. Nichts wurde gespeichert; bitte erneut versuchen.",
	actionFailed: "Die Übersetzung konnte nicht aktualisiert werden. Bitte erneut versuchen.",
};

const fr: Messages = {
	tabOverview: "État",
	tabSettings: "Paramètres",
	openSettings: "Ouvrir les paramètres",

	setupTitle: "Configurer les traductions",
	setupIntro:
		"LinguaDash indique quels contenus existent dans quelle langue et aide à créer ceux qui manquent. Deux étapes sont nécessaires avant de commencer.",
	stepLanguages: "Langues",
	languagesDone: (source, targets) => `Langue source : ${source}. Langues cibles : ${targets}.`,
	languagesTodo:
		"Choisissez les langues cibles dans l’onglet Paramètres. Elles doivent aussi figurer dans les locales i18n d’astro.config.mjs.",
	stepFields: "Champs traduisibles",
	fieldsDone: (collections) => `Activés dans ${collections}.`,
	fieldsTodo:
		"Dans Types de contenu, ouvrez une collection et activez « Traduisible » pour chaque champ qui change selon la langue, par exemple le titre et le texte.",
	stepMachine: "Traduction automatique (facultatif)",
	machineOffHint:
		"Désactivée. Avec une clé DeepL, OpenAI ou Cloudflare AI Gateway, les brouillons de traduction se créent automatiquement.",
	machineOff: "Désactivée",
	machineReady: (name) => `${name}, prêt`,
	machineMissing: (name) => `${name} sélectionné, identifiants manquants`,
	summary: (source, targets, machine) => `${source} → ${targets} · Traduction automatique : ${machine}`,

	tabMissing: (count) => `Manquant (${count})`,
	tabOutdated: (count) => `Obsolète (${count})`,
	tabReview: (count) => `À relire (${count})`,
	missingHint: "Versions linguistiques qui n’existent pas encore. Un brouillon est la première étape.",
	outdatedHint: "La source a changé après leur publication. Mettez-les à jour et publiez-les à nouveau.",
	reviewHint: "Brouillons de traduction pas encore publiés. Relisez-les et publiez-les.",
	noneMissing: "Chaque contenu existe dans toutes les langues cibles.",
	noneOutdated: "Aucune traduction n’est en retard sur sa source.",
	noneReview: "Rien n’attend de relecture.",
	showingFirst: (limit) => `Seuls les ${limit} premiers sont affichés.`,
	partialScan: (limit) => `Seuls les ${limit} premiers contenus de chaque collection ont été vérifiés.`,
	open: "Ouvrir",
	columnMissing: "Langues manquantes",
	columnLanguage: "Langue",
	columnEntry: "Contenu",

	adminOnly: "Seuls les administrateurs peuvent modifier les paramètres de traduction.",
	sourceInfo: (language) =>
		`Langue source : ${language}, la langue par défaut du site. Les traductions sont créées comme contenus distincts et restent des brouillons jusqu’à leur publication.`,
	targetLabel: "Langues cibles",
	addLanguage: "Ajouter une langue",
	searchLanguage: "Rechercher une langue…",
	remove: "Supprimer",
	added: (language) => `Langue ajoutée : ${language}`,
	removed: (language) => `Langue supprimée : ${language}`,
	providerChoice: "Service",
	targetHelp: "N’ajoutez que des langues qui figurent aussi, avec le même code, dans les locales i18n d’astro.config.mjs.",
	providerLabel: "Traduction automatique",
	providerOff: "Désactivée (traduire à la main)",
	deeplKey: "Clé API DeepL (les clés Free se terminent par :fx)",
	openaiKey: "Clé API OpenAI",
	openaiModel: "Modèle OpenAI",
	cfAccount: "ID du compte Cloudflare",
	cfAccountPlaceholder: "32 caractères, visible dans la barre latérale du tableau de bord",
	cfToken: "Jeton API Cloudflare (Account > Workers AI > Read)",
	cfGateway: "ID de l’AI Gateway",
	cfModel: "Modèle",
	tone: "Ton",
	toneDefault: "Par défaut",
	toneFormal: "Formel (vous)",
	toneInformal: "Informel (tu)",
	instructions: "Consignes pour la traduction (facultatif)",
	instructionsPlaceholder: "p. ex. Écrire septante et nonante. Garder les noms de produits en anglais.",
	instructionsTooLong: (max) => `Les consignes ne doivent pas dépasser ${max} caractères.`,
	save: "Enregistrer",
	test: "Tester la traduction automatique",
	forgetKeys: "Supprimer les clés API enregistrées",
	forgetTitle: "Supprimer les clés API enregistrées ?",
	forgetText: "La traduction automatique ne fonctionnera plus tant que vous n’aurez pas saisi une nouvelle clé.",
	forgetConfirm: "Supprimer",
	cancel: "Annuler",
	notReadyTitle: (name) => `${name} est sélectionné, mais n’est pas prêt`,
	notReadyText: "Saisissez les identifiants manquants. En attendant, aucun bouton de traduction n’apparaît.",
	saved: "Paramètres enregistrés",
	keysRemoved: "Clés API supprimées",
	invalidLocale: (codes) => `Code de locale non valide : ${codes}. Utilisez des codes comme de, fr ou pt-br.`,
	chooseProvider: "Choisissez une option de traduction automatique.",
	badAccount: "L’ID du compte Cloudflare comporte 32 caractères hexadécimaux.",
	badGateway: "L’ID de l’AI Gateway ne peut contenir que des lettres, des chiffres, - et _.",
	needsEncryptionKey:
		"Les clés API sont stockées chiffrées. Définissez EMDASH_ENCRYPTION_KEY sur le serveur (à générer avec `npx emdash secrets generate`), puis enregistrez à nouveau.",
	testNeedsProvider: "Enregistrez d’abord un service et ses identifiants.",
	testOk: (name, result, language) => `${name} fonctionne : « ${result} » (${language})`,

	noTranslatableFields:
		"Aucun champ de cette collection n’est marqué comme traduisible. Activez « Traduisible » pour ses champs dans Types de contenu afin de traduire les contenus.",
	noSource: (language) => `Ce contenu n’a pas de version en ${language} qui puisse servir de source.`,
	missing: "Manquant",
	draft: "Brouillon",
	done: "Terminé ✓",
	outdated: "Obsolète",
	translate: "Traduire",
	retranslate: "Retraduire",
	retranslateTitle: (language) => `Retraduire en ${language} ?`,
	retranslateText: "Cela remplace le brouillon actuel, y compris les modifications faites à la main.",
	thisEntry: "ce contenu",
	translateWith: (name) => `Traduire avec ${name}`,
	createTranslation: "Créer un brouillon",
	noTargets: "Aucune langue cible choisie pour l’instant.",
	created: (language) => `Brouillon en ${language} créé à partir de la source`,
	machineDone: (language) => `Traduction automatique en ${language} terminée. À relire avant publication.`,
	nothingToDo: "Rien à faire",
	allLanguages: "Toutes les langues",
	createdMany: (count) => `${count} brouillons créés à partir de la source`,
	machineDoneMany: (count) => `${count} langues traduites automatiquement. À relire avant publication.`,
	providerFailed: (detail) => `${detail}. Vérifiez la clé API dans les paramètres.`,
	formatChanged: "Le service de traduction a modifié la mise en forme. Rien n’a été enregistré ; réessayez.",
	actionFailed: "La traduction n’a pas pu être mise à jour. Réessayez.",
};

const es: Messages = {
	tabOverview: "Estado",
	tabSettings: "Ajustes",
	openSettings: "Abrir ajustes",

	setupTitle: "Configurar traducciones",
	setupIntro:
		"LinguaDash muestra qué entradas existen en cada idioma y ayuda a crear las que faltan. Antes de empezar hacen falta dos pasos.",
	stepLanguages: "Idiomas",
	languagesDone: (source, targets) => `Idioma de origen: ${source}. Idiomas de destino: ${targets}.`,
	languagesTodo:
		"Elige los idiomas de destino en la pestaña Ajustes. También deben figurar en los locales i18n de astro.config.mjs.",
	stepFields: "Campos traducibles",
	fieldsDone: (collections) => `Activado en ${collections}.`,
	fieldsTodo:
		"En Tipos de contenido, abre una colección y activa «Traducible» en cada campo que cambie según el idioma, como el título y el texto.",
	stepMachine: "Traducción automática (opcional)",
	machineOffHint:
		"Desactivada. Con una clave de DeepL, OpenAI o Cloudflare AI Gateway, los borradores de traducción se crean automáticamente.",
	machineOff: "Desactivada",
	machineReady: (name) => `${name}, listo`,
	machineMissing: (name) => `${name} seleccionado, faltan credenciales`,
	summary: (source, targets, machine) => `${source} → ${targets} · Traducción automática: ${machine}`,

	tabMissing: (count) => `Falta (${count})`,
	tabOutdated: (count) => `Desactualizado (${count})`,
	tabReview: (count) => `Por revisar (${count})`,
	missingHint: "Versiones de idioma que aún no existen. Un borrador es el primer paso.",
	outdatedHint: "La fuente cambió después de publicarlas. Actualízalas y vuelve a publicarlas.",
	reviewHint: "Borradores de traducción aún sin publicar. Revísalos y publícalos.",
	noneMissing: "Cada entrada existe en todos los idiomas de destino.",
	noneOutdated: "Ninguna traducción va por detrás de su fuente.",
	noneReview: "No hay nada pendiente de revisión.",
	showingFirst: (limit) => `Se muestran los primeros ${limit}.`,
	partialScan: (limit) => `Solo se comprobaron las primeras ${limit} entradas de cada colección.`,
	open: "Abrir",
	columnMissing: "Idiomas que faltan",
	columnLanguage: "Idioma",
	columnEntry: "Entrada",

	adminOnly: "Solo los administradores pueden cambiar los ajustes de traducción.",
	sourceInfo: (language) =>
		`Idioma de origen: ${language}, el idioma predeterminado del sitio. Las traducciones se crean como entradas propias y siguen siendo borradores hasta que las publiques.`,
	targetLabel: "Idiomas de destino",
	addLanguage: "Añadir un idioma",
	searchLanguage: "Buscar idioma…",
	remove: "Eliminar",
	added: (language) => `Idioma añadido: ${language}`,
	removed: (language) => `Idioma eliminado: ${language}`,
	providerChoice: "Servicio",
	targetHelp: "Añade solo idiomas que también figuren, con el mismo código, en los locales i18n de astro.config.mjs.",
	providerLabel: "Traducción automática",
	providerOff: "Desactivada (traducir a mano)",
	deeplKey: "Clave API de DeepL (las claves Free terminan en :fx)",
	openaiKey: "Clave API de OpenAI",
	openaiModel: "Modelo de OpenAI",
	cfAccount: "ID de cuenta de Cloudflare",
	cfAccountPlaceholder: "32 caracteres, en la barra lateral del panel",
	cfToken: "Token API de Cloudflare (Account > Workers AI > Read)",
	cfGateway: "ID de AI Gateway",
	cfModel: "Modelo",
	tone: "Tratamiento",
	toneDefault: "Predeterminado",
	toneFormal: "Formal (usted)",
	toneInformal: "Informal (tú)",
	instructions: "Indicaciones para la traducción (opcional)",
	instructionsPlaceholder: "p. ej. Usar español de España. Dejar los nombres de productos en inglés.",
	instructionsTooLong: (max) => `Las indicaciones no pueden superar los ${max} caracteres.`,
	save: "Guardar",
	test: "Probar la traducción automática",
	forgetKeys: "Eliminar las claves API guardadas",
	forgetTitle: "¿Eliminar las claves API guardadas?",
	forgetText: "La traducción automática dejará de funcionar hasta que introduzcas una clave de nuevo.",
	forgetConfirm: "Eliminar",
	cancel: "Cancelar",
	notReadyTitle: (name) => `${name} está seleccionado, pero no está listo`,
	notReadyText: "Introduce las credenciales que faltan. Hasta entonces no aparece ningún botón de traducir.",
	saved: "Ajustes guardados",
	keysRemoved: "Claves API eliminadas",
	invalidLocale: (codes) => `Código de locale no válido: ${codes}. Usa códigos como de, fr o pt-br.`,
	chooseProvider: "Elige una opción de traducción automática.",
	badAccount: "El ID de cuenta de Cloudflare tiene 32 caracteres hexadecimales.",
	badGateway: "El ID de AI Gateway solo puede contener letras, dígitos, - y _.",
	needsEncryptionKey:
		"Las claves API se guardan cifradas. Define EMDASH_ENCRYPTION_KEY en el servidor (genérala con `npx emdash secrets generate`) y vuelve a guardar.",
	testNeedsProvider: "Guarda primero un servicio y sus credenciales.",
	testOk: (name, result, language) => `${name} funciona: «${result}» (${language})`,

	noTranslatableFields:
		"Ningún campo de esta colección está marcado como traducible. Activa «Traducible» en sus campos desde Tipos de contenido para poder traducir entradas.",
	noSource: (language) => `Esta entrada no tiene versión en ${language} desde la que traducir.`,
	missing: "Falta",
	draft: "Borrador",
	done: "Listo ✓",
	outdated: "Desactualizado",
	translate: "Traducir",
	retranslate: "Volver a traducir",
	retranslateTitle: (language) => `¿Volver a traducir al ${language}?`,
	retranslateText: "Esto sustituye el borrador actual, incluidos los cambios hechos a mano.",
	thisEntry: "esta entrada",
	translateWith: (name) => `Traducir con ${name}`,
	createTranslation: "Crear borrador",
	noTargets: "Aún no se han elegido idiomas de destino.",
	created: (language) => `Borrador en ${language} creado a partir de la fuente`,
	machineDone: (language) => `Traducción automática al ${language} lista. Revísala antes de publicar.`,
	nothingToDo: "Nada que hacer",
	allLanguages: "Todos los idiomas",
	createdMany: (count) => `${count} borradores creados a partir de la fuente`,
	machineDoneMany: (count) => `${count} idiomas traducidos automáticamente. Revísalos antes de publicar.`,
	providerFailed: (detail) => `${detail}. Comprueba la clave API en los ajustes.`,
	formatChanged: "El servicio de traducción cambió el formato. No se guardó nada; inténtalo de nuevo.",
	actionFailed: "No se pudo actualizar la traducción. Inténtalo de nuevo.",
};

const catalogs: Record<string, Messages> = { en, de, fr, es };

export interface Ui {
	m: Messages;
	/** Locale code as a language name in the admin language, e.g. "fr" → "Französisch". */
	language: (code: string) => string;
	/** The language name capitalized for use on its own, e.g. "en" → "Anglais" in French rather than "anglais". */
	label: (code: string) => string;
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
	const label = (code: string) => {
		const name = language(code);
		return name.charAt(0).toUpperCase() + name.slice(1);
	};
	return { m, language, label, languages: (codes) => codes.map(language).join(", ") };
}
