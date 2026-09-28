# LinguaDash

Multilingual content for [EmDash CMS](https://emdashcms.com). LinguaDash shows which entries
are missing a language, which translations are outdated and which still need review. Editors
translate by hand or draft translations with DeepL, OpenAI or Cloudflare AI Gateway, including
SEO titles and descriptions.

## Requirements

- EmDash 0.42 or later with a [plugin sandbox runner](https://docs.emdashcms.com/deployment/plugin-sandbox/).
- [Astro i18n routing](https://docs.emdashcms.com/guides/internationalization) with every
  language you translate into listed in `i18n.locales`.
- For machine translation, an `EMDASH_ENCRYPTION_KEY` so API keys are stored encrypted.
  Sites created with `create-emdash` have one; otherwise run `emdash secrets generate`.

## Install

Open **Registry** in the admin, search for LinguaDash and select **Install**. To manage the
plugin as a dependency instead, install `emdash-plugin-linguadash` and add it to the
`sandboxed` array:

```js title="astro.config.mjs"
import linguadash from "emdash-plugin-linguadash";

emdash({ sandboxed: [linguadash] });
```

## Get started

The **Translations** page walks through setup until both required steps are done:

1. **Languages.** Open **Translation settings** and enter the target languages, e.g.
   `fr, it, en`. The source language defaults to the site's default locale.
2. **Translatable fields.** In **Content Types**, switch on **Translatable** for every field
   that differs per language, such as the title and body. Fields that stay the same in every
   language, like a price, stay untranslatable.
3. **Machine translation (optional).** Pick a provider in **Translation settings**, enter its
   credentials and select **Test machine translation** to check them with a sample sentence.

Only administrators can change the settings. Saved API keys are never shown again; leave a key
field empty to keep the stored key, or select **Remove saved API keys**.

## Translation status

The **Translation status** panel in the content editor lists every configured language with its
status: **Missing**, **Draft**, **Done** once the translation is published, or **Outdated**. Nobody
sets the status by hand. For a missing language, the panel offers a button that creates the
translation (a draft copy of the source's translatable fields, or a machine translation when a
provider is set up).

Each translation records a fingerprint of the source's translatable fields. When the source is
saved with different values, its translations are flagged **Outdated**; reverting the source, or
publishing the translation again, clears the flag. Translations published before LinguaDash was
installed count as done. The **Translations** admin page has a tab for each kind of open work, with its
count: **Missing** (language versions that don't exist yet), **Outdated** and **To review**
(translation drafts that aren't published yet). It opens on the
first tab that has work. Missing languages are found by checking the first 100 entries of each
collection with translatable fields.

## Machine translation

Pick **DeepL**, **OpenAI (GPT)** or **Cloudflare AI Gateway** under **Machine translation** in
**Translation settings** and enter the matching credentials. DeepL Free keys ending in `:fx` use the Free
API. Cloudflare needs the account ID and an API token with the **Account > Workers AI > Read**
permission. Requests go through the configured AI Gateway (`default` unless you change it), so
gateway logging, caching and rate limits apply. The model can be a Workers AI model
(`@cf/meta/llama-3.3-70b-instruct-fp8-fast` by default) or a third-party gateway model such as
`openai/gpt-4.1-mini`, billed through Cloudflare Unified Billing. The panel then shows a
**Translate** button for each missing language. It saves a draft with the translatable text and
rich-text fields translated. Marks, links and embedded blocks stay in place. While the
translation is an unpublished draft and its source changes, the panel offers **Retranslate**.
Once the translation is published, machine translation no longer touches it, so reviewed work is
never overwritten. Text is sent only to the provider
you choose (`api.deepl.com`, `api-free.deepl.com`, `api.openai.com` or `api.cloudflare.com`).

**Instructions for the translation** (optional, up to 1000 characters) are sent with every
request, for example "Use Swiss spelling (ss instead of ß)" or "Keep product names in English".
OpenAI and Cloudflare models receive them as instructions. DeepL receives them as `context`, which
guides word choice but is not followed like a rule.

## SEO per language

For collections with SEO enabled, a new translation copies the source's SEO title, description,
social image and noindex setting. Machine translation also translates the SEO title and
description. The canonical URL is never copied, because it would point search engines from the
translation back to the source page. Each language keeps its own canonical, which is its own URL
by default. A change to the source's SEO title or description flags its translations
**Outdated**, just like a change to a content field. EmDash itself emits the `hreflang`
alternates between translations in the page head and the sitemaps.

## Public-site components

Sandboxed plugins cannot add markup to public pages, so the package ships two Astro
components for your theme. Both need [Astro i18n routing](https://docs.emdashcms.com/guides/internationalization)
and render nothing without it.

```astro
---
import { getEmDashEntry } from "emdash";
import { LanguageSwitcher, TranslationNotice } from "emdash-plugin-linguadash/astro";

const { entry, fallbackLocale } = await getEmDashEntry("posts", slug, {
	locale: Astro.currentLocale,
});
---

<LanguageSwitcher collection="posts" entryId={entry.data.id} />
<TranslationNotice fallbackLocale={fallbackLocale} collection="posts" entryId={entry.data.id} />
```

**`<LanguageSwitcher>`** lists every configured locale by its own name ("Deutsch",
"Français"). Each link goes to the published translation of the entry, or to that locale's
homepage when there is none. Leave out `collection` and `entryId` on pages that are not
entries to link every homepage. It reuses the hreflang lookup that `<EmDashHead>` already
made for the page, so it adds no database query.

| Prop | Description |
| --- | --- |
| `collection`, `entryId` | The entry being viewed (`entry.data.id`). |
| `labels` | Link text per locale, e.g. `{ de: "DE", fr: "FR" }`. |
| `label` | Accessible name of the `<nav>`. Default `"Language"`. |
| `trailingSlash` | Match Astro's `trailingSlash` when it is not `"ignore"`. |
| `class` | Class on the `<nav>`. |

The current language has `aria-current="page"`; links to a homepage because the entry is not
translated have `data-translated="false"`. The component ships no styles.

**`<TranslationNotice>`** renders a `<p role="note">` when `getEmDashEntry` fell back to
another locale: "This page isn't available in Italian yet. You're reading the German
version." With `collection` and `entryId`, it links to the requested language's
translation instead when one exists under a different slug. Built-in text covers English,
German, French, Italian and Spanish; other languages get English. Override the "not translated"
text with `message` (placeholders `{requested}` and `{fallback}`) or the default slot.

Fallback needs `emdash` 0.41.0 or later. In older versions `getEmDashEntry` returns no
entry instead of the fallback, and the notice never shows.

## Develop

```sh
pnpm install
pnpm run validate
pnpm run typecheck
pnpm run test
pnpm run build
```

To test against a running EmDash site, run `pnpm run dev` in this
directory (rebuilds on save) and `pnpm add file:../path/to/this`
in the site. Then `import linguadash from "emdash-plugin-linguadash"` and pass
it into `emdash({ sandboxed: [linguadash] })`.

`pnpm run test` builds the plugin and runs its tests through Worker Loader using
EmDash's production sandbox wrapper and host bridge.

## Publish

Releases are published from GitHub Actions. Bump `version` in `package.json`,
commit, and push a matching tag:

```sh
git tag linguadash@0.1.1
git push origin linguadash@0.1.1
```

The tag starts two workflows. `emdash-release.yml` builds the bundle, signs its
provenance and publishes the release to the EmDash plugin registry.
`npm-publish.yml` runs the typecheck and tests, then publishes the package to
npm with provenance. A release that asks for more permissions waits for
approval in the [release dashboard](https://releases.emdashcms.com/publisher).

## Version bumps

Bump `version` in `package.json` when you ship a release. The
scaffold's `emdash-plugin.jsonc` deliberately omits `version` —
the build pipeline reads it from `package.json` so there's a single
source of truth. **Bump major** for breaking changes, **bump minor**
for new routes or hooks, **bump patch** for fixes.

You MUST bump version whenever you change `capabilities`, `allowedHosts`,
or `storage` in the manifest. Installed users have consented to the
old trust contract; a change without a version bump would let new
behaviour slip past consent.
