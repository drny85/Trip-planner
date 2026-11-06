import { describe, expect, test } from "vitest";
import { currencyChoices, currencyForRegion, currencyFromLocales } from "./currency";

describe("currency", () => {
  test("guesses home currency from the device locale", () => {
    expect(currencyFromLocales(["en-US"])).toBe("USD");
    expect(currencyFromLocales(["es-MX", "en-US"])).toBe("MXN");
    expect(currencyFromLocales(["fr-FR"])).toBe("EUR");
    expect(currencyFromLocales(["ja"])).toBe("JPY");
    expect(currencyFromLocales(["not a tag"])).toBeNull();
    expect(currencyForRegion("gb")).toBe("GBP");
  });
  test("home first, then local, then group, no repeats", () => {
    expect(currencyChoices("USD", "JPY", "USD")).toEqual(["USD", "JPY"]);
    expect(currencyChoices(null, "JPY", "EUR")).toEqual(["JPY", "EUR"]);
    expect(currencyChoices("USD", "USD")).toEqual(["USD"]);
  });
});
