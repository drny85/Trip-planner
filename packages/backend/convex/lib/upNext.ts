import type { ActivityNode } from "./tree";
import type { TripDetails } from "./types";

/**
 * "Up next": the first activity in the trip still to do, in itinerary order, plus
 * the next open step inside it and the couple of activities after it.
 */
export type UpNext = {
  trip: Pick<TripDetails, "_id" | "title" | "destination" | "imageUrl" | "startDate" | "endDate" | "currency">;
  day: { _id: string; title: string; dayNumber: number; date?: string; location?: string; done: number; total: number };
  activity: ActivityNode;
  /** The first open step inside `activity`, at any depth. */
  step?: ActivityNode;
  /** The next open top-level activities after this one (same day first). */
  later: { activity: ActivityNode; dayNumber: number }[];
  /** Whole days from `today` to the trip's start; 0 or less means it is under way. */
  startsInDays: number;
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

function firstOpen(nodes: ActivityNode[]): ActivityNode | undefined {
  for (const n of nodes) {
    if (n.isCompleted) continue;
    return firstOpen(n.children) ?? n;
  }
  return undefined;
}

/** Picks what's next for one trip, or undefined when everything is done. */
export function pickUpNext(trip: TripDetails, today: string): UpNext | undefined {
  const open = trip.subTrips.flatMap((s) => s.activities.filter((a) => !a.isCompleted).map((a) => ({ s, a })));
  const first = open[0];
  if (!first) return undefined;
  const { s, a } = first;
  const step = firstOpen(a.children);
  return {
    trip: {
      _id: trip._id,
      title: trip.title,
      destination: trip.destination,
      imageUrl: trip.imageUrl,
      startDate: trip.startDate,
      endDate: trip.endDate,
      currency: trip.currency,
    },
    day: {
      _id: s._id,
      title: s.title,
      dayNumber: s.dayNumber,
      date: s.date,
      location: s.location,
      done: s.activities.filter((x) => x.isCompleted).length,
      total: s.activities.length,
    },
    activity: a,
    step: step && step._id !== a._id ? step : undefined,
    later: open.slice(1, 3).map((o) => ({ activity: o.a, dayNumber: o.s.dayNumber })),
    startsInDays: daysBetween(today, trip.startDate),
  };
}
