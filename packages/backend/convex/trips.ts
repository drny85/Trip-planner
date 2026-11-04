import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { getOptionalUserId, getOwnedTrip } from "./lib/auth";
import { insertTripTree } from "./lib/insertTripTree";
import { tripTreeInput } from "./lib/validators";
import type { PublicTripDetails, TripDetails } from "./lib/types";

/** The caller's trips, soonest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("trips")
      .withIndex("by_userId_startDate", (q) => q.eq("userId", userId))
      .order("asc")
      .collect();
  },
});

/** One trip with its days and activities, already sorted, for the Trip Details screen. */
export const get = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }): Promise<TripDetails | null> => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || trip.userId !== userId) return null;
    return loadDetails(ctx, trip);
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
    const { userId: _userId, prompt: _prompt, shareToken: _token, ...details } = await loadDetails(ctx, trip);
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
  const subTrips = await ctx.db
    .query("subTrips")
    .withIndex("by_tripId_order", (q) => q.eq("tripId", trip._id))
    .collect();

  const withActivities = await Promise.all(
    subTrips.map(async (subTrip) => ({
      ...subTrip,
      activities: await ctx.db
        .query("activities")
        .withIndex("by_subTripId_order", (q) => q.eq("subTripId", subTrip._id))
        .collect(),
    })),
  );

  const all = withActivities.flatMap((s) => s.activities);
  return {
    ...trip,
    subTrips: withActivities,
    progress: { completed: all.filter((a) => a.isCompleted).length, total: all.length },
  };
}

/** 128 bits of randomness, URL-safe. */
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
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
    await Promise.all([
      ...activities.map((a) => ctx.db.delete("activities", a._id)),
      ...subTrips.map((s) => ctx.db.delete("subTrips", s._id)),
    ]);
    await ctx.db.delete("trips", tripId);
  },
});

/** Saves a trip tree produced by `ai.generateTrip`. Internal: only the action calls it. */
export const saveGenerated = internalMutation({
  args: { userId: v.string(), prompt: v.string(), tree: tripTreeInput },
  handler: (ctx, { userId, prompt, tree }) =>
    insertTripTree(ctx, { userId, tree, prompt, isAIGenerated: true }),
});
