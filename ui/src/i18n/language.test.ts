import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeUiLocale, i18n, LANGUAGE_STORAGE_KEY, readUiLocale, statusText, t } from ".";
import { supportedLocales } from "./locales";
import { validateLocaleMessages } from "./locale-validation";
import english from "./messages/en.json";
import chinese from "./messages/zh-CN.json";

describe("UI language selection", () => {
  const stored = new Map<string, string>();
  const reload = vi.fn();
  const replace = vi.fn();
  beforeEach(async () => {
    stored.clear(); reload.mockClear(); replace.mockClear();
    vi.stubGlobal("window", {
      localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) },
      location: { href: "https://example.test/company/tasks?filter=mine#active", reload, replace },
    });
    vi.stubGlobal("document", { documentElement: { lang: "en" } });
    await i18n.changeLanguage("en");
  });
  afterEach(async () => { vi.unstubAllGlobals(); await i18n.changeLanguage("en"); });

  it("preserves every upstream language and validates the supplementary catalog", () => {
    expect(supportedLocales).toEqual(expect.arrayContaining(["en", "zh-CN", "zh-TW", "ja", "ar"]));
    expect(validateLocaleMessages(chinese, english)).toEqual([]);
    expect(readUiLocale()).toBe("en");
    stored.set(LANGUAGE_STORAGE_KEY, "ja");
    expect(readUiLocale()).toBe("ja");
    stored.set(LANGUAGE_STORAGE_KEY, "invalid");
    expect(readUiLocale()).toBe("en");
  });

  it("persists Chinese, updates document language and reloads module-level labels", async () => {
    await changeUiLocale("zh-CN");
    expect(stored.get(LANGUAGE_STORAGE_KEY)).toBe("zh-CN");
    expect(readUiLocale()).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(statusText("in_progress")).toBe("进行中");
    expect(t("ui:format.minutesAgo", { count: 3 })).toBe("3 分钟前");
    expect(reload).toHaveBeenCalledOnce();
    await changeUiLocale("en");
    expect(statusText("in_progress")).toBe("in progress");
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("falls back to English supplementary messages for other supported languages", async () => {
    await changeUiLocale("ja");
    expect(statusText("in_progress")).toBe("in progress");
    expect(statusText("custom_state", "Custom state")).toBe("Custom state");
    await expect(changeUiLocale("invalid")).rejects.toThrow("Unsupported UI language");
  });

  it("keeps the selected language and route after reload when storage is blocked", async () => {
    window.localStorage.setItem = () => { throw new Error("blocked"); };
    await changeUiLocale("zh-CN");
    const target = "https://example.test/company/tasks?filter=mine&uiLanguage=zh-CN#active";
    expect(replace).toHaveBeenCalledWith(target);
    window.location.href = target;
    expect(readUiLocale()).toBe("zh-CN");
  });
});
