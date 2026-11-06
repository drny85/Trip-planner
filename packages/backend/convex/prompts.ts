import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { HOUR_MS, IMPROVE_LIMIT_PER_HOUR } from "./lib/promptBrief";

/**
 * Counts one "Improve with AI" request against the caller's hourly limit.
 * Returns false (and records nothing) when they've hit it. Improving a request
 * never counts against the trip allowance: it doesn't plan or start a trip.
 */
export const takeImproveSlot = internalMutation({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => {
    const now = Date.now();
    const since = now - HOUR_MS;
    const stale = await ctx.db
      .query("promptImprovements")
      .withIndex("by_userId_at", (q) => q.eq("userId", userId).lt("at", since))
      .take(50);
    for (const row of stale) await ctx.db.delete("promptImprovements", row._id);
    const recent = await ctx.db
      .query("promptImprovements")
      .withIndex("by_userId_at", (q) => q.eq("userId", userId).gte("at", since))
      .take(IMPROVE_LIMIT_PER_HOUR);
    if (recent.length >= IMPROVE_LIMIT_PER_HOUR) return false;
    await ctx.db.insert("promptImprovements", { userId, at: now });
    return true;
  },
});
