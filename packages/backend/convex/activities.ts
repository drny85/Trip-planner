import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getOwnedActivity, getOwnedTrip } from "./lib/auth";
import { activityFields } from "./lib/validators";

/** Marks an activity done or not done. Clients call this with an optimistic update. */
export const setCompleted = mutation({
  args: { activityId: v.id("activities"), isCompleted: v.boolean() },
  handler: async (ctx, { activityId, isCompleted }) => {
    await getOwnedActivity(ctx, activityId);
    await ctx.db.patch("activities", activityId, {
      isCompleted,
      completedAt: isCompleted ? Date.now() : undefined,
    });
  },
});

/** Partial edit of an activity's details (inline edit or the edit sheet). */
export const update = mutation({
  args: {
    activityId: v.id("activities"),
    patch: v.object({
      ...activityFields,
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      address: v.optional(v.string()),
      photoUrl: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { activityId, patch }) => {
    await getOwnedActivity(ctx, activityId);
    await ctx.db.patch("activities", activityId, patch);
  },
});

export const create = mutation({
  args: { subTripId: v.id("subTrips"), ...activityFields },
  handler: async (ctx, { subTripId, ...fields }) => {
    const subTrip = await ctx.db.get("subTrips", subTripId);
    if (!subTrip) throw new Error("Day not found");
    await getOwnedTrip(ctx, subTrip.tripId);

    const last = await ctx.db
      .query("activities")
      .withIndex("by_subTripId_order", (q) => q.eq("subTripId", subTripId))
      .order("desc")
      .first();

    return ctx.db.insert("activities", {
      ...fields,
      subTripId,
      tripId: subTrip.tripId,
      isCompleted: false,
      order: (last?.order ?? -1) + 1,
    });
  },
});

/**
 * Moves an activity to `toIndex` within `toSubTripId` (same day or another day)
 * and renumbers the affected days so `order` stays 0..n-1.
 */
export const move = mutation({
  args: {
    activityId: v.id("activities"),
    toSubTripId: v.id("subTrips"),
    toIndex: v.number(),
  },
  handler: async (ctx, { activityId, toSubTripId, toIndex }) => {
    const activity = await getOwnedActivity(ctx, activityId);
    const target = await ctx.db.get("subTrips", toSubTripId);
    if (!target || target.tripId !== activity.tripId) throw new Error("Day not found");

    const loadDay = (subTripId: typeof toSubTripId) =>
      ctx.db
        .query("activities")
        .withIndex("by_subTripId_order", (q) => q.eq("subTripId", subTripId))
        .collect();

    const sourceDay = (await loadDay(activity.subTripId)).filter((a) => a._id !== activityId);
    const targetDay =
      activity.subTripId === toSubTripId ? sourceDay : await loadDay(toSubTripId);

    const index = Math.max(0, Math.min(toIndex, targetDay.length));
    targetDay.splice(index, 0, activity);

    // Only write rows whose day or position actually changed.
    const renumber = (day: typeof targetDay, subTripId: typeof toSubTripId) =>
      Promise.all(
        day.map((a, order) =>
          a.order === order && a.subTripId === subTripId
            ? null
            : ctx.db.patch("activities", a._id, { order, subTripId }),
        ),
      );

    await renumber(targetDay, toSubTripId);
    if (activity.subTripId !== toSubTripId) await renumber(sourceDay, activity.subTripId);
  },
});

export const remove = mutation({
  args: { activityId: v.id("activities") },
  handler: async (ctx, { activityId }) => {
    const activity = await getOwnedActivity(ctx, activityId);
    await ctx.db.delete("activities", activityId);
    const rest = await ctx.db
      .query("activities")
      .withIndex("by_subTripId_order", (q) => q.eq("subTripId", activity.subTripId))
      .collect();
    await Promise.all(
      rest.map((a, order) => (a.order === order ? null : ctx.db.patch("activities", a._id, { order }))),
    );
  },
});
