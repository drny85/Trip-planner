import type { Id } from "../convex/_generated/dataModel";
import { ancestorIds, findNode, flatten, mapTree } from "../convex/lib/tree";
import type { TripDetails } from "../convex/lib/types";

/**
 * Check-offs made with no connection. The phone keeps them in an outbox, shows
 * them on the saved copy of the trip right away, and sends them once it's back
 * online. Shared here so the rules match the server mutations exactly.
 */
export type PendingCheck =
  | { kind: "activity"; tripId: Id<"trips">; activityId: Id<"activities">; isCompleted: boolean; at: number }
  | { kind: "packing"; tripId: Id<"trips">; itemId: Id<"packingItems">; isPacked: boolean; at: number };

/** One entry per thing checked: a later tap on the same item replaces the earlier one. */
export const pendingKey = (op: PendingCheck) => (op.kind === "activity" ? `activity:${op.activityId}` : `packing:${op.itemId}`);

/**
 * Adds a check-off. The newest tap on an item wins and moves to the end, so the
 * server replays them in the order they last happened (marking a stop done and
 * then reopening one of its steps comes out the same on both sides).
 */
export function enqueue(queue: PendingCheck[], op: PendingCheck): PendingCheck[] {
  const key = pendingKey(op);
  return [...queue.filter((o) => pendingKey(o) !== key), op];
}

/** Drops one entry, but only if it's still the same tap (one made after it is kept). */
export function settle(queue: PendingCheck[], op: PendingCheck): PendingCheck[] {
  return queue.filter((o) => !(pendingKey(o) === pendingKey(op) && o.at === op.at));
}

export function withProgress(trip: TripDetails): TripDetails {
  const all = trip.subTrips.flatMap((s) => flatten(s.activities));
  return { ...trip, progress: { completed: all.filter((a) => a.isCompleted).length, total: all.length } };
}

/**
 * Marks an activity done or not on a trip, as activities.setCompleted does: done
 * cascades down to its steps, not done reopens the stops above it.
 */
export function applyCompletion(trip: TripDetails, activityId: Id<"activities">, isCompleted: boolean, at = Date.now()): TripDetails {
  const completedAt = isCompleted ? at : undefined;
  let touched = false;
  const subTrips = trip.subTrips.map((s) => {
    const node = findNode(s.activities, activityId);
    if (!node) return s;
    touched = true;
    const ids = new Set(isCompleted ? flatten([node]).map((n) => n._id) : [activityId, ...ancestorIds(s.activities, activityId)]);
    return { ...s, activities: mapTree(s.activities, (a) => (ids.has(a._id) ? { ...a, isCompleted, completedAt } : a)) };
  });
  return touched ? withProgress({ ...trip, subTrips }) : trip;
}

/** The trip as it will be once the outbox has synced. */
export function applyPendingToTrip<T extends TripDetails | null | undefined>(trip: T, queue: PendingCheck[]): T {
  if (!trip) return trip;
  let next: TripDetails = trip;
  for (const op of queue) {
    if (op.kind === "activity" && op.tripId === trip._id) next = applyCompletion(next, op.activityId, op.isCompleted, op.at);
  }
  return next as T;
}

/** A packing list as it will be once the outbox has synced. */
export function applyPendingToPacking<T extends { _id: Id<"packingItems">; isPacked: boolean }>(
  items: T[] | null | undefined,
  queue: PendingCheck[],
): T[] | null | undefined {
  if (!items) return items;
  const packed = new Map<string, boolean>();
  for (const op of queue) if (op.kind === "packing") packed.set(op.itemId, op.isPacked);
  if (packed.size === 0) return items;
  return items.map((i) => (packed.has(i._id) && packed.get(i._id) !== i.isPacked ? { ...i, isPacked: packed.get(i._id)! } : i));
}

/** Everything a trip shows that's worth having on the phone ahead of time: its photos. */
export function tripPhotoUrls(trip: TripDetails): string[] {
  const urls = new Set<string>();
  if (trip.imageUrl) urls.add(trip.imageUrl);
  for (const s of trip.subTrips) for (const a of flatten(s.activities)) if (a.photoUrl) urls.add(a.photoUrl);
  return [...urls].filter((u) => /^https?:\/\//.test(u));
}
