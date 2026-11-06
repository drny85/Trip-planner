import { expect, test } from "vitest";
import { FLIGHT, flightPoint, formatElapsed, planningProgress, planningStage, PLANNING_STAGES, PLANNING_STOPS } from "./planning";

test("stages move on schedule and the last one waits", () => {
  expect(planningStage(0)).toBe(0);
  expect(planningStage(3_999)).toBe(0);
  expect(planningStage(4_000)).toBe(1);
  expect(planningStage(30_000)).toBe(3);
  expect(planningStage(10 * 60_000)).toBe(PLANNING_STAGES.length - 1);
});

test("progress rises but never claims to be done", () => {
  expect(planningProgress(0)).toBe(0);
  expect(planningProgress(10_000)).toBeGreaterThan(planningProgress(5_000));
  expect(planningProgress(10 * 60_000)).toBe(0.96);
});

test("the flight starts and ends on the route's endpoints", () => {
  expect(flightPoint(0)).toMatchObject(FLIGHT.from);
  const end = flightPoint(1);
  expect(end.x).toBeCloseTo(FLIGHT.to.x);
  expect(end.y).toBeCloseTo(FLIGHT.to.y);
  expect(flightPoint(0, 0.5).angle).toBeLessThan(0); // climbing at take-off
  expect(flightPoint(1).angle).toBeGreaterThan(0); // descending to land
});

test("elapsed time reads as m:ss", () => {
  expect(formatElapsed(7_400)).toBe("0:07");
  expect(formatElapsed(72_000)).toBe("1:12");
});

test("each stage's stop sits further along the route", () => {
  expect(PLANNING_STOPS[0]).toBe(0);
  for (let i = 1; i < PLANNING_STOPS.length; i++) expect(PLANNING_STOPS[i]!).toBeGreaterThan(PLANNING_STOPS[i - 1]!);
});
