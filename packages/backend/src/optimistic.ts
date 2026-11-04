import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { TripDetails } from "../convex/lib/types";

/**
 * Optimistic updates shared by web and mobile. Use them like:
 *   useMutation(api.activities.setCompleted).withOptimisticUpdate(optimisticSetCompleted)
 */

function updateTripDetails(
  store: OptimisticLocalStore,
  update: (trip: TripDetails) => TripDetails,
) {
  for (const { args, value } of store.getAllQueries(api.trips.get)) {
    if (value) store.setQuery(api.trips.get, args, update(value));
  }
}

function withProgress(trip: TripDetails): TripDetails {
  const all = trip.subTrips.flatMap((s) => s.activities);
  return { ...trip, progress: { completed: all.filter((a) => a.isCompleted).length, total: all.length } };
}

export function optimisticSetCompleted(
  store: OptimisticLocalStore,
  args: { activityId: Id<"activities">; isCompleted: boolean },
) {
  updateTripDetails(store, (trip) =>
    withProgress({
      ...trip,
      subTrips: trip.subTrips.map((s) => ({
        ...s,
        activities: s.activities.map((a) =>
          a._id === args.activityId
            ? { ...a, isCompleted: args.isCompleted, completedAt: args.isCompleted ? Date.now() : undefined }
            : a,
        ),
      })),
    }),
  );
}

export function optimisticMove(
  store: OptimisticLocalStore,
  args: { activityId: Id<"activities">; toSubTripId: Id<"subTrips">; toIndex: number },
) {
  updateTripDetails(store, (trip) => {
    const moving = trip.subTrips.flatMap((s) => s.activities).find((a) => a._id === args.activityId);
    if (!moving) return trip;
    const subTrips = trip.subTrips.map((s) => ({
      ...s,
      activities: s.activities.filter((a) => a._id !== args.activityId),
    }));
    const target = subTrips.find((s) => s._id === args.toSubTripId);
    if (!target) return trip;
    const index = Math.max(0, Math.min(args.toIndex, target.activities.length));
    target.activities.splice(index, 0, { ...moving, subTripId: args.toSubTripId });
    return {
      ...trip,
      subTrips: subTrips.map((s) => ({ ...s, activities: s.activities.map((a, order) => ({ ...a, order })) })),
    };
  });
}

export function optimisticRemove(
  store: OptimisticLocalStore,
  args: { activityId: Id<"activities"> },
) {
  updateTripDetails(store, (trip) =>
    withProgress({
      ...trip,
      subTrips: trip.subTrips.map((s) => ({
        ...s,
        activities: s.activities
          .filter((a) => a._id !== args.activityId)
          .map((a, order) => ({ ...a, order })),
      })),
    }),
  );
}
