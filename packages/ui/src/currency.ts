/**
 * Currencies for the expense picker. A traveler's home currency is guessed from
 * their device region (mobile can also read it straight from the OS), and they
 * can always pick another one.
 */

/** Region (ISO 3166-1 alpha-2) to its currency. Covers the regions people mostly travel from. */
const BY_REGION: Record<string, string> = {
  US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", UY: "UYU", DO: "DOP", PR: "USD", CR: "CRC", GT: "GTQ", PA: "USD", EC: "USD", SV: "USD", VE: "VES", BO: "BOB", PY: "PYG", HN: "HNL", NI: "NIO", JM: "JMD",
  GB: "GBP", IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", PT: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", FI: "EUR", GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", HR: "EUR", MT: "EUR", CY: "EUR",
  CH: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", IS: "ISK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", RS: "RSD", UA: "UAH", TR: "TRY", RU: "RUB",
  JP: "JPY", CN: "CNY", HK: "HKD", TW: "TWD", KR: "KRW", SG: "SGD", MY: "MYR", TH: "THB", VN: "VND", ID: "IDR", PH: "PHP", IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR",
  AU: "AUD", NZ: "NZD", AE: "AED", SA: "SAR", QA: "QAR", IL: "ILS", EG: "EGP", MA: "MAD", ZA: "ZAR", NG: "NGN", KE: "KES", GH: "GHS", TZ: "TZS",
};

/** Codes offered under "Other currency", most-used first. */
export const CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "MXN", "BRL", "CHF", "CNY", "HKD", "KRW", "SGD", "THB", "INR", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY", "AED", "ZAR", "ARS", "CLP", "COP", "PEN", "DOP", "CRC", "IDR", "MYR", "PHP", "VND", "TWD", "ILS", "EGP", "MAD", "ISK",
] as const;

export const isCurrencyCode = (code: string) => /^[A-Z]{3}$/.test(code);

/** The currency of a region code ("US" -> "USD"), or null when unknown. */
export function currencyForRegion(region: string | null | undefined): string | null {
  return (region && BY_REGION[region.toUpperCase()]) || null;
}

/** Guesses a home currency from BCP 47 language tags like "en-US" or "es-419-x". */
export function currencyFromLocales(tags: readonly string[]): string | null {
  for (const tag of tags) {
    try {
      const region = new Intl.Locale(tag).region ?? new Intl.Locale(tag).maximize().region;
      const code = currencyForRegion(region);
      if (code) return code;
    } catch {
      // Not a valid tag; try the next one.
    }
  }
  return null;
}

/**
 * The currencies to offer for an expense, in order: the traveler's home currency
 * first, then the trip's local currency, then the group's, without repeats.
 */
export function currencyChoices(home: string | null | undefined, local: string | null | undefined, group?: string | null): string[] {
  return [...new Set([home, local, group].filter((c): c is string => !!c && isCurrencyCode(c)))];
}
