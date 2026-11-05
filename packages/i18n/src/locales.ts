/** The languages the apps ship with. `en` is the source; every other dictionary must match its keys. */
export const locales = ["en", "es", "fr", "pt", "de", "ja"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Shown in the language picker, each in its own language. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  de: "Deutsch",
  ja: "日本語",
};

/** The language's name in English, for the AI prompt. */
export const languageInEnglish: Record<Locale, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese (Brazil)",
  de: "German",
  ja: "Japanese",
};

/** Region used for dates, times and money when the device doesn't name one for this language. */
const defaultRegion: Record<Locale, string> = {
  en: "en-US",
  es: "es-419",
  fr: "fr-FR",
  pt: "pt-BR",
  de: "de-DE",
  ja: "ja-JP",
};

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (locales as readonly string[]).includes(value);

/** "es-MX" -> "es", "pt_BR" -> "pt", "zh-CN" -> null. */
export function toLocale(tag: string | null | undefined): Locale | null {
  const lang = tag?.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(lang) ? lang : null;
}

/** First supported language in a preference list (device languages, Accept-Language order). */
export function pickLocale(tags: readonly (string | null | undefined)[]): Locale {
  for (const tag of tags) {
    const locale = toLocale(tag);
    if (locale) return locale;
  }
  return defaultLocale;
}

/** Parses an Accept-Language header into tags, best first. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => /^q=([\d.]+)$/.exec(p.trim())?.[1]).find(Boolean);
      return { tag: tag!.trim(), q: q ? Number(q) : 1, i };
    })
    .filter((x) => x.tag && x.tag !== "*" && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map((x) => x.tag);
}

/**
 * The BCP 47 tag for Intl formatting: the person's own regional tag when it is
 * for the chosen language (so "es-ES" gets 24-hour times and "es-MX" 12-hour),
 * otherwise this language's default region.
 */
export function formatTagFor(locale: Locale, preferred: readonly (string | null | undefined)[] = []): string {
  for (const tag of preferred) {
    if (!tag || toLocale(tag) !== locale || !/[-_]/.test(tag)) continue;
    const normalized = tag.replace("_", "-");
    try {
      return Intl.getCanonicalLocales(normalized)[0] ?? defaultRegion[locale];
    } catch {
      // Not a valid tag; keep looking.
    }
  }
  return defaultRegion[locale];
}
