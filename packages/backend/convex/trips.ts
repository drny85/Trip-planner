import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { deleteTripBookings } from "./bookings";
import { findMembership, getOptionalUserId, getOwnedTrip } from "./lib/auth";
import { insertTripTree } from "./lib/insertTripTree";
import { newToken } from "./lib/tokens";
import { pickUpNext, type UpNext } from "./lib/upNext";
import { buildTree } from "./lib/tree";
import { tripTreeInput } from "./lib/validators";
import type { PublicTripDetails, TripDetails } from "./lib/types";

/** Trips the user owns or has joined, soonest first. */
async function myTrips(ctx: QueryCtx, userId: string) {
  const [owned, memberships] = await Promise.all([
    ctx.db
      .query("trips")
      .withIndex("by_userId_startDate", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("tripMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  const ownedIds = new Set(owned.map((t) => t._id));
  const joined = await Promise.all(
    memberships.filter((m) => !ownedIds.has(m.tripId)).map((m) => ctx.db.get("trips", m.tripId)),
  );
  return [...owned, ...joined.filter((t): t is Doc<"trips"> => t !== null)].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
}

/** The caller's trips (owned and joined), soonest first. `isOwner` tells them apart. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (!userId) return [];
    return (await myTrips(ctx, userId)).map(({ inviteToken: _invite, ...t }) => ({ ...t, isOwner: t.userId === userId }));
  },
});

/**
 * The next thing to do across the user's trips: the trip under way, or else the
 * soonest upcoming one, that still has open activities. `today` is the caller's
 * local date ("YYYY-MM-DD") so "today" matches where the traveler is.
 */
export const upNext = query({
  args: { today: v.string() },
  handler: async (ctx, { today }): Promise<UpNext | null> => {
    const userId = await getOptionalUserId(ctx);
    if (!userId) return null;
    const trips = await myTrips(ctx, userId);
    for (const trip of trips.filter((t) => t.endDate >= today)) {
      const next = pickUpNext(await loadDetails(ctx, trip), today);
      if (next) return next;
    }
    return null;
  },
});

/** One trip with its days and activities, already sorted, for the Trip Details screen. */
export const get = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }): Promise<TripDetails | null> => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    const member = trip && userId ? await findMembership(ctx, trip, userId) : null;
    if (!trip || !member) return null;
    const details = await loadDetails(ctx, trip);
    // Members see the itinerary; the share link stays the owner's to hand out.
    return { ...details, myRole: member.role, shareToken: member.role === "owner" ? trip.shareToken : undefined };
  },
});

/** Read-only view of a shared trip. Anyone with the link can see it; nobody can edit it. */
export const getShared = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<PublicTripDetails | null> => {
    if (token.length < 16) return null;
    const trip = await ctx.db
      .query("trips")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", token))
      .unique();
    if (!trip) return null;
    const { userId: _userId, prompt: _prompt, shareToken: _token, myRole: _role, ...details } =
      await loadDetails(ctx, trip);
    return details;
  },
});

/** Turns on the share link (or returns the existing one's token). */
export const share = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await getOwnedTrip(ctx, tripId);
    if (trip.shareToken) return trip.shareToken;
    const shareToken = newToken();
    await ctx.db.patch("trips", tripId, { shareToken });
    return shareToken;
  },
});

/** Turns the share link off. Old links stop working. */
export const unshare = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await getOwnedTrip(ctx, tripId);
    await ctx.db.patch("trips", tripId, { shareToken: undefined });
  },
});

async function loadDetails(ctx: QueryCtx, trip: Doc<"trips">): Promise<TripDetails> {
  const [subTrips, activities] = await Promise.all([
    ctx.db
      .query("subTrips")
      .withIndex("by_tripId_order", (q) => q.eq("tripId", trip._id))
      .collect(),
    ctx.db
      .query("activities")
      .withIndex("by_tripId", (q) => q.eq("tripId", trip._id))
      .collect(),
  ]);

  // The invite token never leaves the backend through this shape (see members.forTrip).
  const { inviteToken: _invite, ...tripFields } = trip;
  return {
    ...tripFields,
    myRole: "owner",
    subTrips: subTrips.map((subTrip) => ({
      ...subTrip,
      activities: buildTree(activities.filter((a) => a.subTripId === subTrip._id)),
    })),
    // Every activity counts, sub-activities included.
    progress: { completed: activities.filter((a) => a.isCompleted).length, total: activities.length },
  };
}


export const update = mutation({
  args: {
    tripId: v.id("trips"),
    title: v.optional(v.string()),
    destination: v.optional(v.string()),
    description: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, { tripId, ...patch }) => {
    await getOwnedTrip(ctx, tripId);
    await ctx.db.patch("trips", tripId, patch);
  },
});

/** Deletes a trip and everything under it. */
export const remove = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await getOwnedTrip(ctx, tripId);
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_tripId", (q) => q.eq("tripId", tripId))
      .collect();
    const subTrips = await ctx.db
      .query("subTrips")
      .withIndex("by_tripId_order", (q) => q.eq("tripId", tripId))
      .collect();
    const [members, suggestions, votes, memories, packing, expenses, notifications] = await Promise.all([
      ctx.db.query("tripMembers").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("suggestions").withIndex("by_tripId_status", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("votes").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("memories").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("packingItems").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("expenses").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("notifications").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    await Promise.all([
      ...activities.map((a) => ctx.db.delete("activities", a._id)),
      ...subTrips.map((s) => ctx.db.delete("subTrips", s._id)),
      ...members.map((m) => ctx.db.delete("tripMembers", m._id)),
      ...suggestions.map((s) => ctx.db.delete("suggestions", s._id)),
      ...votes.map((x) => ctx.db.delete("votes", x._id)),
      ...memories.map((m) => ctx.db.delete("memories", m._id)),
      ...memories.map((m) => ctx.storage.delete(m.storageId)),
      ...packing.map((p) => ctx.db.delete("packingItems", p._id)),
      ...expenses.map((e) => ctx.db.delete("expenses", e._id)),
      ...notifications.map((n) => ctx.db.delete("notifications", n._id)),
    ]);
    await deleteTripBookings(ctx, tripId);
    await ctx.db.delete("trips", tripId);
  },
});

/** Saves a trip tree produced by `ai.generateTrip`. Internal: only the action calls it. */
export const saveGenerated = internalMutation({
  args: { userId: v.string(), prompt: v.string(), model: v.string(), tree: tripTreeInput },
  handler: async (ctx, { userId, prompt, model, tree }) => {
    const tripId = await insertTripTree(ctx, { userId, tree, prompt, aiModel: model, isAIGenerated: true });
    // Real photos of each place replace the stock ones in the background.
    await ctx.scheduler.runAfter(0, internal.photos.enrichTrip, { tripId });
    return tripId;
  },
});
