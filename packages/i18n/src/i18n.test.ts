import { describe, expect, it } from "vitest";
import { dayTitle } from "@trip/ui";
import { createFormat, formatTagFor, messages, notificationText, parseAcceptLanguage, pickLocale, toLocale, translator } from "./index";
import { buildI18n } from "./react";

describe("translator", () => {
  it("fills placeholders and falls back to the key for unknown messages", () => {
    expect(translator("es")("trip.doneOf", { done: 2, total: 5 })).toBe("2 de 5 hechas");
    expect(translator("en")("nope.missing" as never)).toBe("nope.missing");
  });

  it("picks the plural form for the language", () => {
    const en = translator("en");
    expect(en("trip.stops", { count: 1 })).toBe("1 stop");
    expect(en("trip.stops", { count: 3 })).toBe("3 stops");
    // French treats 0 and 1 as singular.
    expect(translator("fr")("time.days", { count: 0 })).toBe("0 jour");
    expect(translator("ja")("time.days", { count: 1 })).toBe("1日間");
  });

  it("formats numbers in placeholders for the locale", () => {
    expect(translator("de")("trip.doneOf", { done: 1200, total: 3000 })).toBe("1.200 von 3.000 erledigt");
  });

  it("keeps a top-level key named `other` as a plain message, not a plural", () => {
    expect(translator("en")("categories.other")).toBe(messages.en.categories.other);
  });
});

describe("every language", () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const walk = (en: Record<string, unknown>, other: Record<string, unknown>, path: string[] = []): string[] =>
    Object.entries(en).flatMap(([k, v]) => {
      const o = other[k];
      if (typeof v === "string") return JSON.stringify(placeholders(v)) === JSON.stringify(placeholders(o as string)) ? [] : [[...path, k].join(".")];
      if (typeof (v as { other?: unknown }).other === "string" && Object.keys(v as object).every((x) => ["one", "other"].includes(x))) return [];
      return walk(v as Record<string, unknown>, o as Record<string, unknown>, [...path, k]);
    });

  for (const locale of ["es", "fr", "pt", "de", "ja"] as const) {
    it(`${locale} uses the same placeholders as English`, () => {
      expect(walk(messages.en, messages[locale])).toEqual([]);
    });
  }
});

describe("formatting", () => {
  it("shows English times on a 12-hour clock", () => {
    const f = createFormat("en", "en-GB");
    expect(f.time("14:30")).toBe("2:30 PM");
    expect(f.time("00:05")).toBe("12:05 AM");
    expect(f.time("later")).toBe("later");
  });

  it("uses a 24-hour clock where the region does", () => {
    expect(createFormat("de", "de-DE").time("14:30")).toBe("14:30");
    expect(createFormat("fr", "fr-FR").time("09:00")).toBe("09:00");
  });

  it("formats calendar dates without a timezone shift", () => {
    expect(createFormat("en", "en-US").day("2027-04-02")).toBe("Apr 2");
    expect(createFormat("ja", "ja-JP").day("2027-04-02")).toBe("4月2日");
  });

  it("formats money for the locale and survives unknown currencies", () => {
    expect(createFormat("en", "en-US").money(3000, "JPY")).toBe("¥3,000");
    expect(createFormat("de", "de-DE").money(12.5, "EUR").replace(/\s/g, " ")).toBe("12,50 €");
    expect(createFormat("en", "en-US").money(10, "NOPE")).toBe("10 NOPE");
  });

  it("builds durations and relative times from translated messages", () => {
    const { f } = buildI18n("es");
    expect(f.duration(90)).toBe("1 h 30 min");
    expect(f.countdown(1, 1)).toBe("Mañana");
    expect(f.ago(0, 3 * 3_600_000)).toBe("hace 3 h");
  });

  it("translates category labels", () => {
    expect(buildI18n("pt").category("food", "lunch").text).toBe("Comida · Almoço");
    expect(buildI18n("de").category("unknown").text).toBe("Aktivität");
  });
});

describe("choosing a language", () => {
  it("maps regional tags to a shipped language", () => {
    expect(toLocale("es-MX")).toBe("es");
    expect(toLocale("pt_BR")).toBe("pt");
    expect(toLocale("zh-CN")).toBeNull();
    expect(pickLocale(["zh-CN", "ja-JP", "en"])).toBe("ja");
    expect(pickLocale([])).toBe("en");
  });

  it("orders Accept-Language by quality", () => {
    expect(parseAcceptLanguage("en;q=0.5, fr-CA, de;q=0.8, *")).toEqual(["fr-CA", "de", "en"]);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });

  it("keeps the person's region when it matches the language", () => {
    expect(formatTagFor("es", ["es-ES"])).toBe("es-ES");
    expect(formatTagFor("es", ["en-US"])).toBe("es-419");
    expect(formatTagFor("pt")).toBe("pt-BR");
  });
});

describe("notifications", () => {
  it("renders stored params in the reader's language", () => {
    const { t, f } = buildI18n("es");
    const params = { name: "Ana", item: "Cena", count: 3, amountCents: 4500, currency: "USD" };
    expect(notificationText(t, f.money, "expense", params)).toMatch(/^Ana agregó Cena \((US\$|USD\s?)45\), dividido entre 3\.$/);
    expect(notificationText(t, f.money, "idea", { name: "Ana", title: "Museo" })).toBe("Ana sugirió «Museo». Vota.");
  });
});

describe("dayTitle", () => {
  it("strips a day prefix in any language", () => {
    expect(dayTitle("Day 2 · Old town")).toBe("Old town");
    expect(dayTitle("Día 2 · Centro")).toBe("Centro");
    expect(dayTitle("2日目 · 浅草")).toBe("浅草");
    expect(dayTitle("Arrival")).toBe("Arrival");
  });
});
