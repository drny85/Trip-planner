import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getOptionalUserId, getUserId } from "./lib/auth";

/** The caller's latest notifications across all their trips. */
export const feed = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (!userId) return null;
    const rows = await ctx.db.query("notifications").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(30);
    return {
      unread: rows.filter((r) => !r.isRead).length,
      items: rows.map((r) => ({ _id: r._id, _creationTime: r._creationTime, tripId: r.tripId, kind: r.kind, text: r.text, params: r.params, isRead: r.isRead })),
    };
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_isRead", (q) => q.eq("userId", userId).eq("isRead", false))
      .collect();
    await Promise.all(unread.map((n) => ctx.db.patch("notifications", n._id, { isRead: true })));
  },
});

/** Saves this phone's Expo push token for the signed-in user. */
export const registerPushToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getUserId(ctx);
    if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) throw new Error("Not an Expo push token");
    const existing = await ctx.db.query("pushTokens").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (existing?.userId === userId) return;
    if (existing) await ctx.db.delete("pushTokens", existing._id);
    await ctx.db.insert("pushTokens", { userId, token });
  },
});

export const forgetTokens = internalMutation({
  args: { tokens: v.array(v.string()) },
  handler: async (ctx, { tokens }) => {
    for (const token of tokens) {
      const row = await ctx.db.query("pushTokens").withIndex("by_token", (q) => q.eq("token", token)).unique();
      if (row) await ctx.db.delete("pushTokens", row._id);
    }
  },
});
