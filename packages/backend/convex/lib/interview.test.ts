import { expect, test } from "vitest";
import { cleanPreferences, preferenceRules, upcomingMonths } from "./interview";

test("upcomingMonths starts next month and rolls over the year", () => {
  expect(upcomingMonths(3, new Date(Date.UTC(2026, 10, 6)))).toEqual(["2026-12", "2027-01", "2027-02"]);
});

test("free days are never the first day and are a single free block", () => {
  const rules = preferenceRules(cleanPreferences({ destination: "Kyoto", days: 6, pace: "freeDays" }));
  expect(rules).toContain("never the first day");
  expect(rules).toContain("exactly one activity");
  expect(rules).toContain("Dates: flexible");
});

test("cleanPreferences drops bad values and defaults pace to balanced in the rules", () => {
  const p = cleanPreferences({ destination: "  Rome ", days: 400, month: "2027-13", travelers: "aliens" });
  expect(p).toMatchObject({ destination: "Rome", days: undefined, month: undefined, travelers: undefined });
  expect(preferenceRules(p)).toContain("Balanced days");
});
