import i18n, { type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import { DEFAULT_LOCALE, i18nextResources, supportedLocales } from "./locales";

export const LANGUAGE_STORAGE_KEY = "paperclip.ui.language";

export function readUiLocale(): string {
  try {
    const requested = new URL(window.location.href).searchParams.get("uiLanguage");
    if (requested && supportedLocales.includes(requested)) return requested;
  } catch { /* A URL is not available during server rendering. */ }
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && supportedLocales.includes(stored)) return stored;
  } catch { /* Storage is optional, including during server rendering. */ }
  return DEFAULT_LOCALE;
}

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: readUiLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  ns: ["translation", "ui"],
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  returnEmptyString: true,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

if (typeof document !== "undefined") document.documentElement.lang = i18n.language || DEFAULT_LOCALE;

export function uiLocale(): string {
  return i18n.language || DEFAULT_LOCALE;
}

export async function changeUiLocale(locale: string): Promise<void> {
  if (!supportedLocales.includes(locale)) throw new Error("Unsupported UI language");
  if (locale === uiLocale()) return;
  try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, locale); } catch { /* Keep the current-page selection. */ }
  await i18n.changeLanguage(locale);
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  // Module-level option arrays also contain translated labels. Reload for a
  // consistent language, using the URL if browser storage is unavailable.
  if (typeof window === "undefined") return;
  let persisted = false;
  try { persisted = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === locale; } catch { /* Use the URL. */ }
  const url = new URL(window.location.href);
  if (!persisted || url.searchParams.has("uiLanguage")) {
    url.searchParams.set("uiLanguage", locale);
    window.location.replace(url.toString());
  } else {
    window.location.reload();
  }
}

export function statusText(status: string, fallback = status.replace(/[_-]/g, " ")): string {
  // Preserve each caller's English casing and wording unless this language
  // supplies an explicit state translation; do not use English fallback data.
  const locale = uiLocale();
  const key = `states.${status}`;
  return locale !== DEFAULT_LOCALE && i18n.hasResourceBundle(locale, "ui") && i18n.getResource(locale, "ui", key)
    ? String(i18n.t(key, { ns: "ui" }))
    : fallback;
}

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
