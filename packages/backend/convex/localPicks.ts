import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getOwnedTrip } from "./lib/auth";
import { requireStarted, tripUnlocked } from "./lib/billing";
import { isSubcategoryOf } from "./lib/categories";
import { activityFields, crowdForecast, localTip } from "./lib/validators";
import { hasNotes } from "./journal";

/**
 * "Local's pick": one day's tourist-heavy stops swapped for places locals love
 * (the AI proposes it in ai.localPickDay). Applying keeps a snapshot of what it
 * replaced, so the organizer can switch back to the original plan.
 */

const topLevel = (ctx: QueryCtx, subTripId: Id<"subTrips">) =>
  ctx.db
    .query("activities")
    .withIndex("by_subTripId_parentId_order", (q) => q.eq("subTripId", subTripId).eq("parentId", undefined))
    .collect();

const snapshotFor = (ctx: QueryCtx, subTripId: Id<"subTrips">) =>
  ctx.db
    .query("localPickSnapshots")
    .withIndex("by_subTripId", (q) => q.eq("subTripId", subTripId))
    .unique();

/**
 * A stop that's never swapped out: it's done, has steps, photos, notes or a
 * booking, or the group voted it in.
 */
async function isLocked(ctx: QueryCtx, a: Doc<"activities">, votedIn: Set<string>) {
  if (a.isCompleted || votedIn.has(a._id)) return true;
  const [child, photo, booking] = await Promise.all([
    ctx.db.query("activities").withIndex("by_parentId", (q) => q.eq("parentId", a._id)).first(),
    ctx.db.query("memories").withIndex("by_activityId", (q) => q.eq("activityId", a._id)).first(),
    ctx.db.query("bookings").withIndex("by_activityId", (q) => q.eq("activityId", a._id)).first(),
  ]);
  return Boolean(child || photo || booking) || (await hasNotes(ctx, [a._id]));
}

async function votedInIds(ctx: QueryCtx, subTripId: Id<"subTrips">) {
  const ideas = await ctx.db
    .query("suggestions")
    .withIndex("by_subTripId", (q) => q.eq("subTripId", subTripId))
    .collect();
  return new Set(ideas.flatMap((s) => (s.status === "accepted" && s.activityId ? [s.activityId as string] : [])));
}

/** The day in the compact shape the model reads, for the organizer only. */
export const dayForLocal = internalQuery({
  args: { subTripId: v.id("subTrips"), userId: v.string() },
  handler: async (ctx, { subTripId, userId }) => {
    const day = await ctx.db.get("subTrips", subTripId);
    const trip = day && (await ctx.db.get("trips", day.tripId));
    if (!day || !trip || trip.userId !== userId) return null;
    const [top, votedIn] = await Promise.all([topLevel(ctx, subTripId), votedInIds(ctx, subTripId)]);
    return {
      /** The trip hasn't been started (its organizer isn't subscribed): no AI swaps yet. */
      tripLocked: !(await tripUnlocked(ctx, trip)),
      tripTitle: trip.title,
      destination: trip.destination,
      dayNumber: day.dayNumber,
      date: day.date,
      location: day.location,
      activities: await Promise.all(
        top.map(async (a) => ({
          id: a._id as string,
          title: a.title,
          category: a.category ?? "other",
          startTime: a.startTime,
          durationMinutes: a.durationMinutes,
          address: a.address,
          description: a.description.slice(0, 200),
          locked: await isLocked(ctx, a, votedIn),
        })),
      ),
    };
  },
});

const insights = { localTips: v.optional(v.array(localTip)), crowd: v.optional(crowdForecast) };

/** Saves tips and crowd forecasts from ai.addLocalTips. Returns how many stops got them. */
export const saveTips = internalMutation({
  args: {
    subTripId: v.id("subTrips"),
    tips: v.array(v.object({ activityId: v.id("activities"), ...insights, isLocalPick: v.optional(v.boolean()) })),
  },
  handler: async (ctx, { subTripId, tips }) => {
    let saved = 0;
    for (const { activityId, ...patch } of tips) {
      const a = await ctx.db.get("activities", activityId);
      if (!a || a.subTripId !== subTripId) continue;
      await ctx.db.patch("activities", activityId, patch);
      saved++;
    }
    return saved;
  },
});

/** Strips what a snapshot doesn't keep (ids, completion, Google lookup state). */
function toSnapshot(a: Doc<"activities">): Doc<"localPickSnapshots">["replaced"][number] {
  const { _id, _creationTime, subTripId: _s, tripId: _t, parentId: _p, isCompleted: _c, completedAt: _ca, placeLookedUp: _l, ...rest } = a;
  return rest;
}

/**
 * Applies a local's-pick proposal: kept stops get their new time, tips and
 * crowd forecast; new ones are added; the rest are saved to the snapshot and
 * removed. Locked stops the plan leaves out stay, at the end of the day.
 */
export const apply = mutation({
  args: {
    subTripId: v.id("subTrips"),
    activities: v.array(
      v.union(
        v.object({ keepId: v.id("activities"), startTime: v.optional(v.string()), durationMinutes: v.optional(v.number()), ...insights }),
        v.object(activityFields),
      ),
    ),
  },
  handler: async (ctx, { subTripId, activities }) => {
    const day = await ctx.db.get("subTrips", subTripId);
    if (!day) throw new Error("Day not found");
    const trip = await getOwnedTrip(ctx, day.tripId);
    await requireStarted(ctx, trip, trip.userId);
    const [current, votedIn, existing] = await Promise.all([topLevel(ctx, subTripId), votedInIds(ctx, subTripId), snapshotFor(ctx, subTripId)]);
    const byId = new Map(current.map((a) => [a._id as string, a]));
    const kept = new Set<string>();
    // Picking again builds on the first snapshot: the original plan is what "undo" restores.
    const previouslyAdded = new Set<string>(existing?.addedIds ?? []);
    const replaced = [...(existing?.replaced ?? [])];
    const added: Id<"activities">[] = [];

    let order = 0;
    for (const item of activities) {
      if ("keepId" in item) {
        if (!byId.has(item.keepId) || kept.has(item.keepId)) continue;
        kept.add(item.keepId);
        // Only what the plan sets: a kept stop without a time keeps its own.
        const { keepId, ...fields } = item;
        const patch = Object.fromEntries(Object.entries(fields).filter(([, val]) => val !== undefined));
        await ctx.db.patch("activities", keepId, { ...patch, order: order++ });
      } else {
        const subcategory = item.subcategory && isSubcategoryOf(item.category ?? "other", item.subcategory) ? item.subcategory : undefined;
        added.push(await ctx.db.insert("activities", { ...item, subcategory, tripId: day.tripId, subTripId, isCompleted: false, order: order++ }));
      }
    }
    const stillAdded = [...previouslyAdded].filter((id) => kept.has(id)) as Id<"activities">[];
    for (const a of current) {
      if (kept.has(a._id)) continue;
      if (await isLocked(ctx, a, votedIn)) {
        await ctx.db.patch("activities", a._id, { order: order++ });
        if (previouslyAdded.has(a._id)) stillAdded.push(a._id);
        continue;
      }
      // An earlier pick that's swapped again isn't part of the original plan.
      if (!previouslyAdded.has(a._id)) replaced.push(toSnapshot(a));
      await ctx.db.delete("activities", a._id);
    }

    const addedIds = [...stillAdded, ...added];
    if (existing) await ctx.db.patch("localPickSnapshots", existing._id, { replaced, addedIds });
    else await ctx.db.insert("localPickSnapshots", { subTripId, replaced, addedIds });
    await ctx.db.patch("subTrips", subTripId, { localPickAt: Date.now() });
  },
});

const minutesOf = (time?: string) => {
  const m = time ? /^(\d{1,2}):(\d{2})$/.exec(time) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Back to the original plan: the local picks that were added go (unless
 * they're locked, e.g. done or with photos) and the stops they replaced come
 * back, all in time order.
 */
export const restore = mutation({
  args: { subTripId: v.id("subTrips") },
  handler: async (ctx, { subTripId }) => {
    const day = await ctx.db.get("subTrips", subTripId);
    if (!day) throw new Error("Day not found");
    await getOwnedTrip(ctx, day.tripId);
    const snapshot = await snapshotFor(ctx, subTripId);
    if (snapshot) {
      const votedIn = await votedInIds(ctx, subTripId);
      for (const id of snapshot.addedIds) {
        const a = await ctx.db.get("activities", id);
        if (a && a.subTripId === subTripId && !a.parentId && !(await isLocked(ctx, a, votedIn))) await ctx.db.delete("activities", id);
      }
      for (const a of snapshot.replaced) {
        await ctx.db.insert("activities", { ...a, tripId: day.tripId, subTripId, isCompleted: false });
      }
      // Time order; stops without a time keep their place relative to each other, at the end.
      const rows = await topLevel(ctx, subTripId);
      const sorted = rows
        .map((a, i) => ({ a, i, m: minutesOf(a.startTime) }))
        .sort((x, y) => (x.m ?? Infinity) - (y.m ?? Infinity) || x.a.order - y.a.order || x.i - y.i);
      await Promise.all(sorted.map(({ a }, order) => (a.order === order ? null : ctx.db.patch("activities", a._id, { order }))));
      await ctx.db.delete("localPickSnapshots", snapshot._id);
    }
    await ctx.db.patch("subTrips", subTripId, { localPickAt: undefined });
  },
});
