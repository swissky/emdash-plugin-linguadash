# linguadash

A sandboxed plugin for [EmDash CMS](https://emdashcms.com).

## Translation status

The **Translations** panel in the post and page editor lists every configured language. From
there editors create a translation (a draft copy of the source's translatable fields) and mark it
as translated once the text is done.

Each translation records a fingerprint of the source's translatable fields. When the source is
saved with different values, its translations are flagged **Outdated**; reverting the source
clears the flag. The **Translations** admin page counts outdated, untranslated and up-to-date
entries and links to the ones that need work.

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
German, French and Italian; other languages get English. Override the "not translated"
text with `message` (placeholders `{requested}` and `{fallback}`) or the default slot.

Fallback needs `emdash` with the locale fallback fix for
[#1679](https://github.com/emdash-cms/emdash/issues/1679); until then `getEmDashEntry`
returns no entry instead of the fallback, and the notice never shows.

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
in the site. Then `import linguadash from "linguadash"` and pass
it into `emdash({ sandboxed: [linguadash] })`.

`pnpm run test` builds the plugin and runs its tests through Worker Loader using
EmDash's production sandbox wrapper and host bridge.

## Publish

```sh
pnpm run login -- alice.example.com
pnpm run publish          # builds and uploads artifacts to your PDS
```

To publish from GitHub Actions, run `pnpm run release:setup`. The command
creates one shared workflow at the Git repository root.

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
