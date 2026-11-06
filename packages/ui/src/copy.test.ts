import { describe, expect, test } from "vitest";
import { addDays, copyEnd, suggestedCopyStart } from "./index";

describe("Use this trip dates", () => {
  test("keeps the trip's length on new dates", () => {
    const trip = { startDate: "2026-04-02", endDate: "2026-04-06" };
    expect(copyEnd(trip, "2027-02-26")).toBe("2027-03-02");
    expect(copyEnd({ startDate: "2026-04-02", endDate: "2026-04-02" }, "2027-01-01")).toBe("2027-01-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("suggests the original start when it's ahead, else two weeks out", () => {
    expect(suggestedCopyStart("2027-06-01", "2026-11-05")).toBe("2027-06-01");
    expect(suggestedCopyStart("2026-04-02", "2026-11-05")).toBe("2026-11-19");
  });
});
