import { defaultLocale, isLocale, translator } from "@trip/i18n";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { findMembership, getMemberTrip, getOptionalUserId } from "./lib/auth";
import { listMembers } from "./lib/members";

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
