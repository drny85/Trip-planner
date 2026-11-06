import type { Locale } from "./locales";

/**
 * Locale-aware formatting for dates, times and money. English always shows
 * 12-hour times ("2:30 PM"); other languages follow their region's clock.
 * Only DateTimeFormat/NumberFormat basics are used, so it runs on Hermes too.
 */
export function createFormat(locale: Locale, formatTag: string) {
  const utcDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  };
  const dayFmt = new Intl.DateTimeFormat(formatTag, { month: "short", day: "numeric", timeZone: "UTC" });
  const weekdayFmt = new Intl.DateTimeFormat(formatTag, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const longFmt = new Intl.DateTimeFormat(formatTag, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const timeFmt = new Intl.DateTimeFormat(formatTag, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    ...(locale === "en" ? { hour12: true } : {}),
  });
  // On a 24-hour clock most of Europe and Brazil write "09:00"; Japan writes "9:00".
  const hourCycle = timeFmt.resolvedOptions().hourCycle;
  const padHour = locale !== "ja" && (hourCycle === "h23" || hourCycle === "h24");
  const numberFmt = new Intl.NumberFormat(formatTag);
  const monthFmt = new Intl.DateTimeFormat(formatTag, { month: "long", year: "numeric", timeZone: "UTC" });
  const monthShortFmt = new Intl.DateTimeFormat(formatTag, { month: "short", timeZone: "UTC" });

  const valid = (iso: string) => /^\d{4}-\d{2}-\d{2}/.test(iso);

  return {
    tag: formatTag,
    /** "2027-04-02" -> "Apr 2" / "2 abr" / "4月2日". Parsed as a calendar date, so no timezone shift. */
    day: (iso: string) => (valid(iso) ? dayFmt.format(utcDate(iso)) : iso),
    /** "2027-04-02" -> "Fri, Apr 2". */
    weekday: (iso: string) => (valid(iso) ? weekdayFmt.format(utcDate(iso)) : iso),
    /** "2027-04" -> "April 2027". */
    month: (ym: string) => (/^\d{4}-\d{2}$/.test(ym) ? monthFmt.format(utcDate(`${ym}-01`)) : ym),
    /** "2027-04" -> "Apr". */
    monthShort: (ym: string) => (/^\d{4}-\d{2}$/.test(ym) ? monthShortFmt.format(utcDate(`${ym}-01`)) : ym),
    /** "2027-04-02" -> "Friday, April 2". */
    longDay: (iso: string) => (valid(iso) ? longFmt.format(utcDate(iso)) : iso),
    /** "Apr 2 – Apr 6". */
    dateRange: (start: string, end: string) => {
      const a = valid(start) ? dayFmt.format(utcDate(start)) : start;
      const b = valid(end) ? dayFmt.format(utcDate(end)) : end;
      return a === b ? a : `${a} – ${b}`;
    },
    /** Stored "14:30" -> "2:30 PM" (en) or "14:30" (de). Anything that isn't HH:MM passes through unchanged. */
    time: (hhmm: string | undefined | null) => {
      if (!hhmm) return "";
      const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
      if (!m) return hhmm;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h > 23 || min > 59) return hhmm;
      if (locale === "en") return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
      const out = timeFmt.format(new Date(Date.UTC(2000, 0, 1, h, min)));
      return padHour && /^\d:/.test(out) ? `0${out}` : out;
    },
    /** 3000, "JPY" -> "¥3,000". Falls back to a plain number for an unknown currency code. */
    money: (amount: number, currency = "USD") => {
      try {
        return new Intl.NumberFormat(formatTag, { style: "currency", currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
      } catch {
        return `${numberFmt.format(Math.round(amount))} ${currency}`;
      }
    },
    /** The currency's symbol in this locale ("$", "€", "¥"). */
    currencySymbol: (currency = "USD") => {
      try {
        return new Intl.NumberFormat(formatTag, { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
      } catch {
        return currency;
      }
    },
    number: (n: number) => numberFmt.format(n),
  };
}

export type Format = ReturnType<typeof createFormat>;
