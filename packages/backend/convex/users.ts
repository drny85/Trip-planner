import { isLocale } from "@trip/i18n";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getOptionalUserId } from "./lib/auth";

/** Creates or refreshes the caller's `users` row from their Clerk identity. Call after sign-in. */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const fields = {
      clerkId: identity.subject,
      name: identity.name,
      email: identity.email,
      imageUrl: identity.pictureUrl,
    };
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      await ctx.db.patch("users", existing._id, fields);
      return existing._id;
    }
    return ctx.db.insert("users", fields);
  },
});

/**
 * Remembers the app language the caller picked, so notifications reach them in it.
 * Works in demo mode too (it keeps a row for the demo user).
 */
export const setLanguage = mutation({
  args: { language: v.string() },
  handler: async (ctx, { language }) => {
    if (!isLocale(language)) throw new Error("Unsupported language");
    const userId = await getOptionalUserId(ctx);
    if (!userId) return null;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .unique();
    if (existing) {
      if (existing.language !== language) await ctx.db.patch("users", existing._id, { language });
      return existing._id;
    }
    return ctx.db.insert("users", { clerkId: userId, language });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});
