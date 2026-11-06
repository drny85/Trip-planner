import { describe, expect, it } from "vitest";
import { daysUntil, fareAdvice, fareHistory, fareTrend, flexGrid, flightFit } from "./fares";

const DAY = 86_400_000;
const now = Date.parse("2027-02-01T12:00:00Z");
const series = (...cents: number[]) => cents.map((c, i) => ({ at: now - (cents.length - 1 - i) * DAY, cents: c }));

describe("fare advice", () => {
  it("says book in the last two weeks, or when it's low", () => {
    expect(fareAdvice({ cents: 90000, daysOut: 10, history: [], now }).verdict).toBe("book");
    expect(fareAdvice({ cents: 90000, daysOut: 80, level: "low", history: [], now })).toMatchObject({ verdict: "book", why: "low" });
    expect(fareAdvice({ cents: 90000, daysOut: 80, typicalLowCents: 95000, history: [], now }).why).toBe("low");
  });
  it("follows the trend", () => {
    expect(fareAdvice({ cents: 90000, daysOut: 60, history: series(100000, 95000, 90000), now })).toMatchObject({ verdict: "wait", why: "falling" });
    expect(fareAdvice({ cents: 110000, daysOut: 60, history: series(100000, 105000, 110000), now })).toMatchObject({ verdict: "soon", why: "rising" });
  });
  it("waits on high prices far out, and watches typical ones", () => {
    expect(fareAdvice({ cents: 150000, daysOut: 90, level: "high", history: [], now })).toMatchObject({ verdict: "wait", why: "high" });
    expect(fareAdvice({ cents: 150000, daysOut: 40, level: "high", history: [], now })).toMatchObject({ verdict: "soon", why: "high" });
    expect(fareAdvice({ cents: 100000, daysOut: 150, level: "typical", history: [], now }).why).toBe("early");
    expect(fareAdvice({ cents: 100000, daysOut: 30, level: "typical", history: [], now }).verdict).toBe("soon");
  });
  it("measures the trend over two weeks and merges histories by day", () => {
    expect(fareTrend(series(100, 90), 14, now)).toBeCloseTo(-0.1);
    expect(fareTrend(series(100), 14, now)).toBeNull();
    expect(fareHistory(series(100, 90), [{ at: now, cents: 80 }]).map((p) => p.cents)).toEqual([100, 80]);
    expect(daysUntil("2027-04-02", "2027-02-01")).toBe(60);
  });
});

describe("nearby dates", () => {
  it("marks the cheapest window when it beats the trip's own dates", () => {
    const grid = flexGrid([
      { shiftDays: 1, outboundDate: "b", cents: 900 },
      { shiftDays: 0, outboundDate: "a", cents: 1000 },
      { shiftDays: -1, outboundDate: "c" },
    ]);
    expect(grid.map((c) => c.shiftDays)).toEqual([-1, 0, 1]);
    expect(grid.map((c) => c.cheapest)).toEqual([false, false, true]);
    expect(grid[2]!.deltaCents).toBe(-100);
    expect(flexGrid([{ shiftDays: 0, outboundDate: "a", cents: 1000 }, { shiftDays: 1, outboundDate: "b", cents: 1200 }]).some((c) => c.cheapest)).toBe(false);
  });
});

describe("fitting days around flights", () => {
  const days = [
    { _id: "d1", dayNumber: 1, date: "2027-04-02" },
    { _id: "d2", dayNumber: 2, date: "2027-04-03" },
    { _id: "d3", dayNumber: 3, date: "2027-04-04" },
  ];
  it("finds the landing on day 1 and the take-off on the last day", () => {
    const fit = flightFit(
      [
        { startDate: "2027-04-01", startTime: "11:40", endDate: "2027-04-02", endTime: "15:10" },
        { startDate: "2027-04-04", startTime: "18:30", endDate: "2027-04-04", endTime: "12:00" },
      ],
      days,
    );
    expect(fit.arrive).toEqual({ subTripId: "d1", dayNumber: 1, lands: "15:10", freeFrom: "16:40" });
    expect(fit.leave).toEqual({ subTripId: "d3", dayNumber: 3, takesOff: "18:30", leaveBy: "15:30" });
  });
  it("needs the times", () => {
    expect(flightFit([{ startDate: "2027-04-02" }], days)).toEqual({ arrive: undefined, leave: undefined });
  });
});
