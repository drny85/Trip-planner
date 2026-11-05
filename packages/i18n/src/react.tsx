"use client";

import { getCategory, getSubcategory } from "@trip/ui";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createFormat, type Format } from "./format";
import { defaultLocale, formatTagFor, type Locale } from "./locales";
import { en, messages, type MessageKey, type Messages } from "./messages";
import { createTranslator, type Vars } from "./translate";

export type TFunction = (key: MessageKey<Messages>, vars?: Vars) => string;

export type I18n = {
  locale: Locale;
  t: TFunction;
  /** Dates, times and money in the person's language and region. */
  f: Format & {
    /** 90 -> "1 h 30 min". */
    duration: (minutes: number) => string;
    /** Days until a trip starts -> "In 5 days" / "Tomorrow" / "Today" / "Day 3 of your trip". */
    countdown: (startsInDays: number, dayNumber: number) => string;
    /** A past timestamp -> "just now" / "5 min ago" / "3 h ago" / "2 d ago". */
    ago: (timestamp: number, now?: number) => string;
  };
  /** "Stays · Airbnb" in this language, with the emoji and color. */
  category: (category?: string, sub?: string) => { emoji: string; text: string; color: string };
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18n | null>(null);

export function buildI18n(locale: Locale, preferredTags: readonly string[] = [], setLocale: (l: Locale) => void = () => {}): I18n {
  const tag = formatTagFor(locale, preferredTags);
  const t = createTranslator(locale, messages[locale], en, tag) as TFunction;
  const base = createFormat(locale, tag);
  const f: I18n["f"] = {
    ...base,
    duration: (minutes) => {
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      if (h === 0) return t("time.minutes", { count: m });
      if (m === 0) return t("time.hours", { count: h });
      return t("time.hoursMinutes", { h, m });
    },
    countdown: (startsInDays, dayNumber) => {
      if (startsInDays > 1) return t("time.inDays", { count: startsInDays });
      if (startsInDays === 1) return t("time.tomorrow");
      if (startsInDays === 0) return t("time.today");
      return t("time.dayOfTrip", { day: dayNumber });
    },
    ago: (timestamp, now = Date.now()) => {
      const min = Math.floor((now - timestamp) / 60_000);
      if (min < 1) return t("time.justNow");
      if (min < 60) return t("time.minutesAgo", { count: min });
      const h = Math.floor(min / 60);
      if (h < 24) return t("time.hoursAgo", { count: h });
      return t("time.daysAgo", { count: Math.floor(h / 24) });
    },
  };
  const category: I18n["category"] = (cat, sub) => {
    const c = getCategory(cat);
    const key = (cat && cat in en.categories ? cat : "other") as keyof Messages["categories"];
    const label = t(`categories.${key}`);
    const s = getSubcategory(sub);
    const subLabel = s && sub && sub in en.subcategories ? t(`subcategories.${sub as keyof Messages["subcategories"]}`) : s?.label;
    return { emoji: s?.emoji ?? c.emoji, text: subLabel ? `${label} · ${subLabel}` : label, color: c.color };
  };
  return { locale, t, f, category, setLocale };
}

/**
 * Makes `useI18n()` work below it. `preferredTags` are the person's own language
 * tags (device or Accept-Language), used to pick the region for dates and times.
 */
export function I18nProvider({
  locale = defaultLocale,
  preferredTags,
  onLocaleChange,
  children,
}: {
  locale?: Locale;
  preferredTags?: readonly string[];
  onLocaleChange?: (locale: Locale) => void;
  children: ReactNode;
}) {
  const tagsKey = preferredTags?.join(",") ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => buildI18n(locale, preferredTags, onLocaleChange), [locale, tagsKey, onLocaleChange]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const fallbackI18n = buildI18n(defaultLocale);

/** The translator and formatters for the current language. Outside a provider it uses English. */
export function useI18n(): I18n {
  return useContext(I18nContext) ?? fallbackI18n;
}

/** A translated string as an element, for server components that render client text. */
export function T({ k, vars }: { k: MessageKey<Messages>; vars?: Vars }) {
  return <>{useI18n().t(k, vars)}</>;
}
