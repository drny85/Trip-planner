"use client";

import { isLocale, localeNames, locales, type Locale } from "@trip/i18n";
import { I18nProvider, useI18n } from "@trip/i18n/react";
import { useCallback, useState, type ReactNode } from "react";

export const LOCALE_COOKIE = "locale";

/** Holds the chosen language and remembers it in a cookie the server reads on the next visit. */
export function WebI18nProvider({ initialLocale, preferredTags, children }: { initialLocale: Locale; preferredTags: string[]; children: ReactNode }) {
  const [locale, setLocale] = useState(initialLocale);
  const change = useCallback((next: Locale) => {
    setLocale(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
  }, []);
  return (
    <I18nProvider locale={locale} preferredTags={preferredTags} onLocaleChange={change}>
      {children}
    </I18nProvider>
  );
}

/** A compact language menu for the header. */
export function LanguagePicker() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{t("common.language")}</span>
      <span aria-hidden className="pointer-events-none absolute left-2.5 text-sm">
        🌐
      </span>
      <select
        value={locale}
        onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
        className="appearance-none rounded-full border border-border bg-card/70 py-1.5 pl-8 pr-3 text-xs font-semibold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
