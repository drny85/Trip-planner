import { describe, expect, test } from "vitest";
import { budgetSummary } from "./budget";
import type { ActivityNode } from "./tree";

let n = 0;
const node = (over: Partial<ActivityNode>, children: ActivityNode[] = []): ActivityNode =>
  ({ _id: `a${++n}`, title: "x", category: "other", isCompleted: false, order: 0, children, ...over }) as ActivityNode;

describe("budgetSummary", () => {
  test("uses steps' costs instead of the parent's so nothing is counted twice", () => {
    const market = node({ category: "food", estimatedCost: 3000 }, [
      node({ category: "food", estimatedCost: 200 }),
      node({ category: "food", estimatedCost: 2500, actualCost: 2800 }),
      node({ category: "food" }),
    ]);
    const hotel = node({ category: "lodging", estimatedCost: 20000, isCompleted: true });
    const free = node({ category: "sightseeing", estimatedCost: 0 });
    const plain = node({ category: "sightseeing" });
    const b = budgetSummary({ subTrips: [{ _id: "d1", title: "Day 1", dayNumber: 1, activities: [market, hotel, free, plain] }] });

    expect(b.total).toEqual({ estimated: 22700, actual: 22800, hasActual: true });
    expect(b.byCategory.map((c) => [c.category, c.money.estimated])).toEqual([
      ["lodging", 20000],
      ["food", 2700],
      ["sightseeing", 0],
    ]);
    expect(b.byDay[0]!.money.estimated).toBe(22700);
  });

  test("falls back to the parent's own figure when no step has a cost", () => {
    const parent = node({ category: "food", estimatedCost: 1500 }, [node({}), node({}, [node({})])]);
    const b = budgetSummary({ subTrips: [{ _id: "d1", title: "Day 1", dayNumber: 1, activities: [parent] }] });
    expect(b.total.estimated).toBe(1500);
    expect(b.total.hasActual).toBe(false);
  });
});
