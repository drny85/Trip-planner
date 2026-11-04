import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getOwnedTrip, getUserId } from "./lib/auth";
import type { TripDetails } from "./lib/types";

/** The caller's trips, soonest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
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
    const userId = await getUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || trip.userId !== userId) return null;

    const subTrips = await ctx.db
      .query("subTrips")
      .withIndex("by_tripId_order", (q) => q.eq("tripId", tripId))
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
  },
});

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
