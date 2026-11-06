import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { findNode, flatten, insertNode, mapTree, removeNode } from "../convex/lib/tree";
import type { TripDetails } from "../convex/lib/types";
import { applyCompletion, withProgress } from "./offline";

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

export function optimisticSetCompleted(
  store: OptimisticLocalStore,
  args: { activityId: Id<"activities">; isCompleted: boolean },
) {
  updateTripDetails(store, (trip) => applyCompletion(trip, args.activityId, args.isCompleted));
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

/**
 * Shows a sent chat message right away, at the bottom of every open copy of
 * that trip's chat. The server's copy (with its link details) replaces it.
 */
export function optimisticSendChat(
  store: OptimisticLocalStore,
  args: { tripId: Id<"trips">; text: string; activityId?: Id<"activities">; suggestionId?: Id<"suggestions"> },
) {
  for (const { args: queryArgs, value } of store.getAllQueries(api.chat.list)) {
    if (!value || queryArgs.tripId !== args.tripId) continue;
    const mine = [...value.messages].reverse().find((m) => m.isMine);
    const now = Date.now();
    store.setQuery(api.chat.list, queryArgs, {
      ...value,
      messages: [
        ...value.messages,
        {
          _id: `pending-${now}` as Id<"chatMessages">,
          _creationTime: now,
          authorId: mine?.authorId ?? "me",
          authorName: mine?.authorName ?? "",
          authorImageUrl: mine?.authorImageUrl,
          authorIsMember: true,
          isMine: true,
          text: args.text.trim(),
          deleted: false,
          link: undefined,
        },
      ],
    });
  }
}

export function optimisticTogglePacked(store: OptimisticLocalStore, args: { itemId: Id<"packingItems">; isPacked: boolean }) {
  for (const { args: queryArgs, value } of store.getAllQueries(api.packing.list)) {
    if (value) store.setQuery(api.packing.list, queryArgs, value.map((i) => (i._id === args.itemId ? { ...i, isPacked: args.isPacked } : i)));
  }
}
