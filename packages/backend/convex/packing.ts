import { defaultLocale, isLocale, translator } from "@trip/i18n";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { findMembership, getMemberTrip, getOptionalUserId } from "./lib/auth";
import { listMembers } from "./lib/members";
import { itemKey, MAX_RUNS_PER_DAY, type PackingContext } from "./lib/packingAi";
import { packingCategory, tripWeather } from "./lib/validators";

/** A shared packing list for everyone on the trip. */

/** Starter items for "Add the essentials"; trip-specific extras are added by the people going. */
/** Message keys of the starter packing items, added in the caller's language. */
export const ESSENTIALS = [
  "essential1",
  "essential2",
  "essential3",
  "essential4",
  "essential5",
  "essential6",
  "essential7",
  "essential8",
  "essential9",
] as const;

export const list = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const [items, members] = await Promise.all([
      ctx.db.query("packingItems").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      listMembers(ctx, trip),
    ]);
    const names = new Map(members.map((m) => [m.userId, m.name]));
    return items.map((i) => ({
      _id: i._id,
      text: i.text,
      isPacked: i.isPacked,
      claimedBy: i.claimedBy ? { isMe: i.claimedBy === userId, name: names.get(i.claimedBy) ?? "Someone" } : undefined,
      isAi: i.isAi ?? false,
      category: i.category,
      quantity: i.quantity,
      reason: i.reason,
      isGroupItem: i.isGroupItem ?? false,
    }));
  },
});

export const add = mutation({
  args: { tripId: v.id("trips"), text: v.string() },
  handler: async (ctx, { tripId, text }) => {
    const { userId } = await getMemberTrip(ctx, tripId);
    const clean = text.trim().slice(0, 120);
    if (!clean) return null;
    return ctx.db.insert("packingItems", { tripId, text: clean, isPacked: false, addedBy: userId });
  },
});

/** Adds the essentials that aren't on the list yet. */
export const addEssentials = mutation({
  args: { tripId: v.id("trips"), language: v.optional(v.string()) },
  handler: async (ctx, { tripId, language }) => {
    const { userId } = await getMemberTrip(ctx, tripId);
    const existing = await ctx.db.query("packingItems").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect();
    const have = new Set(existing.map((i) => i.text.toLowerCase()));
    const t = translator(isLocale(language) ? language : defaultLocale);
    const missing = ESSENTIALS.map((key) => t(`packing.${key}`)).filter((text) => !have.has(text.toLowerCase()));
    await Promise.all(missing.map((text) => ctx.db.insert("packingItems", { tripId, text, isPacked: false, addedBy: userId })));
    return missing.length;
  },
});

async function memberItem(ctx: MutationCtx, itemId: Id<"packingItems">) {
  const item = await ctx.db.get("packingItems", itemId);
  if (!item) throw new Error("Item not found");
  const { userId } = await getMemberTrip(ctx, item.tripId);
  return { item, userId };
}

export const toggle = mutation({
  args: { itemId: v.id("packingItems"), isPacked: v.boolean() },
  handler: async (ctx, { itemId, isPacked }) => {
    await memberItem(ctx, itemId);
    await ctx.db.patch("packingItems", itemId, { isPacked });
  },
});

/** "I'll bring it" toggles the caller's claim on an item. */
export const claim = mutation({
  args: { itemId: v.id("packingItems") },
  handler: async (ctx, { itemId }) => {
    const { item, userId } = await memberItem(ctx, itemId);
    await ctx.db.patch("packingItems", itemId, { claimedBy: item.claimedBy === userId ? undefined : userId });
  },
});

export const remove = mutation({
  args: { itemId: v.id("packingItems") },
  handler: async (ctx, { itemId }) => {
    await memberItem(ctx, itemId);
    await ctx.db.delete("packingItems", itemId);
  },
});

const DAY_MS = 86_400_000;

/** The latest AI generation for a trip: the weather it packed for. */
export const lastRun = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const run = await ctx.db.query("packingRuns").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).order("desc").first();
    return run ? { at: run._creationTime, added: run.added, weather: run.weather ?? null } : null;
  },
});

/** Everything the AI needs to pack for a trip, for members only. Null when the caller isn't going. */
export const aiContext = internalQuery({
  args: { tripId: v.id("trips"), userId: v.string() },
  handler: async (ctx, { tripId, userId }): Promise<(PackingContext & { coords: { latitude: number; longitude: number } | null; runsToday: number }) | null> => {
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !(await findMembership(ctx, trip, userId))) return null;
    const [days, activities, items, members, runs] = await Promise.all([
      ctx.db.query("subTrips").withIndex("by_tripId_order", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("activities").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("packingItems").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      listMembers(ctx, trip),
      ctx.db
        .query("packingRuns")
        .withIndex("by_tripId", (q) => q.eq("tripId", tripId).gt("_creationTime", Date.now() - DAY_MS))
        .collect(),
    ]);
    const top = activities.filter((a) => !a.parentId).sort((a, b) => a.order - b.order);
    const located = top.find((a) => a.latitude != null && a.longitude != null);
    return {
      tripTitle: trip.title,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      travelers: Math.max(1, members.length),
      days: days.map((d) => ({
        dayNumber: d.dayNumber,
        date: d.date,
        location: d.location,
        activities: top
          .filter((a) => a.subTripId === d._id)
          .slice(0, 12)
          .map((a) => ({ title: a.title.slice(0, 80), category: a.category, subcategory: a.subcategory })),
      })),
      existing: items.map((i) => i.text),
      coords: located ? { latitude: located.latitude!, longitude: located.longitude! } : null,
      runsToday: runs.length,
    };
  },
});

/** Saves an AI list. Items already on the list (added meanwhile) are skipped. */
export const saveAiItems = internalMutation({
  args: {
    tripId: v.id("trips"),
    userId: v.string(),
    model: v.string(),
    weather: v.optional(tripWeather),
    items: v.array(
      v.object({
        text: v.string(),
        category: packingCategory,
        quantity: v.optional(v.number()),
        reason: v.optional(v.string()),
        isGroupItem: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, { tripId, userId, model, weather, items }) => {
    const runs = await ctx.db
      .query("packingRuns")
      .withIndex("by_tripId", (q) => q.eq("tripId", tripId).gt("_creationTime", Date.now() - DAY_MS))
      .collect();
    if (runs.length >= MAX_RUNS_PER_DAY) return 0;
    const existing = await ctx.db.query("packingItems").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect();
    const have = new Set(existing.map((i) => itemKey(i.text)));
    const fresh = items.filter((i) => !have.has(itemKey(i.text)));
    for (const item of fresh) {
      await ctx.db.insert("packingItems", { tripId, ...item, isPacked: false, addedBy: userId, isAi: true });
    }
    await ctx.db.insert("packingRuns", { tripId, userId, model, added: fresh.length, weather });
    return fresh.length;
  },
});
