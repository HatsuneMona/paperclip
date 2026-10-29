# Chinese UI translations

Paperclip uses its existing i18next locale catalogs and loads the available languages from `ui/src/i18n/locales/`. The supplementary `ui` namespace provides English and Simplified Chinese UI text alongside the existing `translation` namespace. English is the default; missing `ui` entries in other languages fall back to English. The existing `translation` catalog validation remains in place.

Choose a language in the classic sidebar or Profile settings. The choice is stored in localStorage. Changing it reloads the page so module-level labels are recalculated. If storage is unavailable, the `uiLanguage` query parameter preserves the selection while retaining the current route, hash, and other query parameters.

## Add translations

Add English source text and its Chinese translation to `scripts/i18n/translations.zh-CN.json`, then run from the repository root:

```sh
pnpm i18n:extract
pnpm i18n:apply
```

`extract` reports candidate and translated counts. `apply` uses `scripts/i18n/localize.cjs` to add translation calls only for source text explicitly covered by the dictionary. It updates `ui/src/i18n/messages/en.json` and `ui/src/i18n/messages/zh-CN.json` while retaining existing valid resources. Repeated application is idempotent. Only UI text matched by the dictionary is migrated; untranslated UI text may remain.

Review the resulting changes in context. Keep user-provided dynamic data, API fields, enum values, URLs and code examples unchanged. To check the localization tool, run:

```sh
pnpm test:i18n-codemod
```
