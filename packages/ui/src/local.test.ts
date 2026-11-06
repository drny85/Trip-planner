import { expect, test } from "vitest";
import { betterTime, crowdBar, inPeak } from "./local";

test("the crowd bar places the peak, the plan and the best time along the day", () => {
  const bar = crowdBar({ level: "busy", peakFrom: "12:00", peakTo: "15:00", bestTime: "09:00" }, "13:30");
  expect(bar.peak?.left).toBeCloseTo((6 / 18) * 100);
  expect(bar.peak?.width).toBeCloseTo((3 / 18) * 100);
  expect(bar.planned).toBeCloseTo((7.5 / 18) * 100);
  expect(bar.best).toBeCloseTo((3 / 18) * 100);
  expect(crowdBar({ level: "quiet" }).peak).toBeNull();
});

test("a better time is only suggested when the plan is crowded", () => {
  const crowd = { level: "moderate" as const, peakFrom: "11:00", peakTo: "14:00", bestTime: "08:00" };
  expect(inPeak(crowd, "11:00")).toBe(true);
  expect(inPeak(crowd, "14:00")).toBe(false);
  expect(betterTime(crowd, "12:00")).toBe("08:00");
  expect(betterTime(crowd, "16:00")).toBeNull();
  expect(betterTime({ level: "packed", bestTime: "07:00" }, "07:00")).toBeNull();
});
