import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { getOptionalUserId, getUserId, authEnabled } from "./lib/auth";
import { billingRow, planKey, tripAllowance, tripUnlocked } from "./lib/billing";

/**
 * Subscriptions run on Clerk Billing. Convex learns who is subscribed two ways:
 * the apps call `refresh` right after checkout, and Clerk's billing webhook
 * (POST /clerk/billing in http.ts) calls it on every change. Both ask Clerk's
 * Backend API, so a forged or out-of-order event can't grant access.
 *
 * Needs on the Convex deployment (pasted by the owner, never committed):
 *   CLERK_SECRET_KEY              Backend API key
 *   CLERK_WEBHOOK_SIGNING_SECRET  from the Clerk webhook endpoint
 */

/** What the caller may do: null when signed out. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (!userId) return null;
    return { ...(await tripAllowance(ctx, userId)), enforced: authEnabled() };
  },
});

/** Whether a trip can be started (checked off, photos, re-plans). Null for no access. */
export const tripLocked = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await ctx.db.get("trips", tripId);
    if (!trip) return null;
    const userId = await getOptionalUserId(ctx);
    return { locked: !(await tripUnlocked(ctx, trip)), isOwner: trip.userId === userId };
  },
});

type Item = { status?: string; plan?: { slug?: string } | null; period_end?: number | null; periodEnd?: number | null };

/**
 * Reads the user's subscription from Clerk. Paid statuses keep access; a canceled
 * item keeps it until its period ends. Returns null when Clerk isn't reachable.
 */
export async function fetchClerkSubscription(userId: string, secret: string, now = Date.now()) {
  const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}/billing/subscription`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (res.status === 404) return { subscribed: false, periodEnd: undefined };
  if (!res.ok) {
    console.log(`Clerk billing lookup failed (${res.status})`);
    return null;
  }
  const body = (await res.json()) as { subscription_items?: Item[]; subscriptionItems?: Item[] };
  const items = (body.subscription_items ?? body.subscriptionItems ?? []).filter((i) => i.plan?.slug === planKey());
  let subscribed = false;
  let periodEnd: number | undefined;
  for (const item of items) {
    const end = item.period_end ?? item.periodEnd ?? undefined;
    if (item.status === "active" || item.status === "past_due") {
      subscribed = true;
      periodEnd = undefined;
      break;
    }
    if (item.status === "canceled" && end && end > now) {
      subscribed = true;
      periodEnd = end;
    }
  }
  return { subscribed, periodEnd };
}

/** Re-reads the caller's subscription from Clerk. Call after checkout or when the app opens. */
export const refresh = action({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const userId = await getUserId(ctx);
    return ctx.runAction(internal.billing.sync, { userId });
  },
});

export const sync = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, { userId }): Promise<boolean> => {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      console.log("CLERK_SECRET_KEY is not set on Convex; can't check subscriptions");
      return false;
    }
    const found = await fetchClerkSubscription(userId, secret);
    if (!found) return false;
    await ctx.runMutation(internal.billing.save, { userId, ...found });
    return found.subscribed;
  },
});

export const save = internalMutation({
  args: { userId: v.string(), subscribed: v.boolean(), periodEnd: v.optional(v.number()) },
  handler: async (ctx, { userId, subscribed, periodEnd }) => {
    const row = await billingRow(ctx, userId);
    const fields = { subscribed, periodEnd, checkedAt: Date.now() };
    if (row) await ctx.db.patch("billing", row._id, fields);
    else await ctx.db.insert("billing", { userId, tripsCreated: 0, ...fields });
  },
});

export const allowanceFor = internalQuery({
  args: { userId: v.string() },
  handler: (ctx, { userId }) => tripAllowance(ctx, userId),
});
