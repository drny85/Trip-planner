import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ancestorIds, findNode, flatten, insertNode, mapTree, removeNode } from "../convex/lib/tree";
import type { TripDetails } from "../convex/lib/types";

/**
 * Optimistic updates shared by web and mobile. Use them like:
 *   useMutation(api.activities.setCompleted).withOptimisticUpdate(optimisticSetCompleted)
 * Each mirrors the server mutation on the nested activity tree.
 */

function updateTripDetails(store: OptimisticLocalStore, update: (trip: TripDetails) => TripDetails) {
  for (const { args, value } of store.getAllQueries(api.trips.get)) {
    if (value) store.setQuery(api.trips.get, args, update(value));
  }
}

function withProgress(trip: TripDetails): TripDetails {
  const all = trip.subTrips.flatMap((s) => flatten(s.activities));
  return { ...trip, progress: { completed: all.filter((a) => a.isCompleted).length, total: all.length } };
}

export function optimisticSetCompleted(
  store: OptimisticLocalStore,
  args: { activityId: Id<"activities">; isCompleted: boolean },
) {
  const { activityId, isCompleted } = args;
  const completedAt = isCompleted ? Date.now() : undefined;
  updateTripDetails(store, (trip) =>
    withProgress({
      ...trip,
      subTrips: trip.subTrips.map((s) => {
        const node = findNode(s.activities, activityId);
        if (!node) return s;
        // Done cascades down; not done reopens the ancestors.
        const ids = new Set(isCompleted ? flatten([node]).map((n) => n._id) : [activityId, ...ancestorIds(s.activities, activityId)]);
        return { ...s, activities: mapTree(s.activities, (a) => (ids.has(a._id) ? { ...a, isCompleted, completedAt } : a)) };
      }),
    }),
  );
}

export function optimisticMove(
  store: OptimisticLocalStore,
  args: { activityId: Id<"activities">; toSubTripId: Id<"subTrips">; toIndex: number; toParentId?: Id<"activities"> },
) {
  updateTripDetails(store, (trip) => {
    const moving = trip.subTrips.map((s) => findNode(s.activities, args.activityId)).find(Boolean);
    if (!moving) return trip;
    if (args.toParentId && flatten([moving]).some((n) => n._id === args.toParentId)) return trip;
    const relocated = { ...moving, subTripId: args.toSubTripId, children: mapTree(moving.children, (c) => ({ ...c, subTripId: args.toSubTripId })) };
    return {
      ...trip,
      subTrips: trip.subTrips.map((s) => {
        const without = removeNode(s.activities, args.activityId);
        return s._id === args.toSubTripId
          ? { ...s, activities: insertNode(without, args.toParentId, args.toIndex, relocated) }
          : { ...s, activities: without };
      }),
    };
  });
}

export function optimisticRemove(store: OptimisticLocalStore, args: { activityId: Id<"activities"> }) {
  updateTripDetails(store, (trip) =>
    withProgress({
      ...trip,
      subTrips: trip.subTrips.map((s) => ({ ...s, activities: removeNode(s.activities, args.activityId) })),
    }),
  );
}
