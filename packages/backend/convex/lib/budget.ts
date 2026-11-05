import { CATEGORIES, type Category } from "./categories";
import type { ActivityNode } from "./tree";

/**
 * Trip budget from the activity tree. Pure, so web and mobile compute it from the
 * trip they already have (and it updates with optimistic edits).
 *
 * A parent's cost is the sum of its steps when any step has a cost; otherwise it is
 * the parent's own figure. That way "Tsukiji breakfast ¥3,000" with priced stalls
 * underneath is not counted twice.
 */
export type Money = { estimated: number; actual: number; hasActual: boolean };
export type BudgetSummary = {
  total: Money;
  byDay: { subTripId: string; title: string; dayNumber: number; money: Money }[];
  byCategory: { category: Category; money: Money }[];
};

const zero = (): Money => ({ estimated: 0, actual: 0, hasActual: false });
const hasCost = (n: ActivityNode): boolean =>
  n.estimatedCost != null || n.actualCost != null || n.children.some(hasCost);

/** The nodes whose own figures count: a costed leaf, or a parent with no costed steps. */
function costedNodes(nodes: ActivityNode[]): ActivityNode[] {
  return nodes.flatMap((n) => (n.children.some(hasCost) ? costedNodes(n.children) : hasCost(n) ? [n] : []));
}

function add(into: Money, n: ActivityNode) {
  const estimated = n.estimatedCost ?? 0;
  into.estimated += estimated;
  // Without an actual figure yet, count the estimate so "spent" stays comparable.
  into.actual += n.actualCost ?? (n.isCompleted ? estimated : 0);
  into.hasActual ||= n.actualCost != null;
}

export function budgetSummary(trip: {
  subTrips: { _id: string; title: string; dayNumber: number; activities: ActivityNode[] }[];
}): BudgetSummary {
  const total = zero();
  const cats = new Map<Category, Money>();
  const byDay = trip.subTrips.map((s) => {
    const money = zero();
    for (const n of costedNodes(s.activities)) {
      add(money, n);
      add(total, n);
      const c = n.category ?? "other";
      if (!cats.has(c)) cats.set(c, zero());
      add(cats.get(c)!, n);
    }
    return { subTripId: s._id, title: s.title, dayNumber: s.dayNumber, money };
  });
  const byCategory = CATEGORIES.filter((c) => cats.has(c))
    .map((category) => ({ category, money: cats.get(category)! }))
    .sort((a, b) => b.money.estimated - a.money.estimated);
  return { total, byDay, byCategory };
}
