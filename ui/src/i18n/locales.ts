import type { Resource } from "i18next";
import uiEnglish from "./messages/en.json";
import uiChinese from "./messages/zh-CN.json";

import { assertValidLocaleMessages } from "./locale-validation";

export const DEFAULT_LOCALE = "en" as const;

const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export const localeMessages = Object.fromEntries(
  Object.entries(localeModules).map(([path, messages]) => {
    const locale = path.match(/\/([A-Za-z0-9_-]+)\.json$/)?.[1];
    if (!locale) {
      throw new Error(`Invalid locale file path: ${path}`);
    }
    return [locale, messages];
  }),
);

if (!(DEFAULT_LOCALE in localeMessages)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

for (const [locale, messages] of Object.entries(localeMessages)) {
  try {
    assertValidLocaleMessages(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
}

// Supplementary UI copy is separate from upstream's complete translation catalogs.
assertValidLocaleMessages(uiChinese, uiEnglish);
const uiMessages: Record<string, unknown> = { en: uiEnglish, "zh-CN": uiChinese };

export const supportedLocales = Object.keys(localeMessages);

export const i18nextResources: Resource = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => [locale, { translation: messages, ...(uiMessages[locale] ? { ui: uiMessages[locale] } : {}) }]),
) as Resource;

export type SupportedLocale = keyof typeof localeMessages;
