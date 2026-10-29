import { Languages } from "lucide-react";
import { changeUiLocale, useTranslation } from "@/i18n";
import { supportedLocales } from "@/i18n/locales";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <Languages className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">语言 / Language</span>
      <select
        value={i18n.language}
        onChange={(event) => void changeUiLocale(event.target.value)}
        aria-label="语言 / Language"
        title="语言 / Language"
        className={compact
          ? "h-8 min-w-0 w-full rounded-md border border-border bg-background text-foreground"
          : "h-8 min-w-0 flex-1 cursor-pointer rounded-md border border-border bg-background px-2 text-foreground"}
      >
        {supportedLocales.map((locale) => (
          <option key={locale} value={locale}>
            {new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale}
          </option>
        ))}
      </select>
    </label>
  );
}
