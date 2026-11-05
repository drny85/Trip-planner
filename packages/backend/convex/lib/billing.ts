import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { translator } from "@trip/i18n";
import { authEnabled } from "./auth";
import { languageOf } from "./notify";

/**
 * The paid plan (Clerk Billing, paid through Stripe):
 * - Anyone can plan their first trip for free, but starting it (checking things
 *   off, photos, re-plans, the story) needs a subscription.
 * - Subscribers can plan as many trips as they like over time, with at most
 *   MAX_UPCOMING not finished yet at once.
 *
 * Joined travelers ride on the organizer's subscription: a trip is unlocked when
 * its owner is subscribed. Demo mode (no Clerk) has no limits.
 */
export const FREE_TRIPS = 1;
export const MAX_UPCOMING = 3;
/** The Clerk Billing plan key that unlocks trips. Override with BILLING_PLAN on Convex. */
export const planKey = () => process.env.BILLING_PLAN || "traveler";

const today = () => new Date().toISOString().slice(0, 10);

export async function billingRow(ctx: QueryCtx | MutationCtx, userId: string) {
  return ctx.db
    .query("billing")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/** Subscribed now: active, or canceled but still inside the period they paid for. */
export function isActive(row: Doc<"billing"> | null, now = Date.now()) {
  if (!row?.subscribed) return false;
  return row.periodEnd === undefined || row.periodEnd > now;
}

export async function isSubscribed(ctx: QueryCtx | MutationCtx, userId: string) {
  if (!authEnabled()) return true;
  return isActive(await billingRow(ctx, userId));
}

export type Allowance = {
  subscribed: boolean;
  /** Trips they've planned, including deleted ones (so deleting the free trip doesn't reset it). */
  tripsCreated: number;
  /** Owned trips that haven't ended yet. */
  upcoming: number;
  maxUpcoming: number;
  /** Why they can't plan another trip right now, or null when they can. */
  blocked: "subscribe" | "tooManyUpcoming" | null;
};

export async function tripAllowance(ctx: QueryCtx | MutationCtx, userId: string): Promise<Allowance> {
  const [row, owned] = await Promise.all([
    billingRow(ctx, userId),
    ctx.db
      .query("trips")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  const subscribed = !authEnabled() || isActive(row);
  const tripsCreated = Math.max(row?.tripsCreated ?? 0, owned.length);
  const day = today();
  const upcoming = owned.filter((t) => t.endDate >= day).length;
  let blocked: Allowance["blocked"] = null;
  if (authEnabled()) {
    if (!subscribed && tripsCreated >= FREE_TRIPS) blocked = "subscribe";
    else if (subscribed && upcoming >= MAX_UPCOMING) blocked = "tooManyUpcoming";
  }
  return { subscribed, tripsCreated, upcoming, maxUpcoming: MAX_UPCOMING, blocked };
}

/** Counts a newly planned trip toward the free one. */
export async function countTrip(ctx: MutationCtx, userId: string) {
  const row = await billingRow(ctx, userId);
  if (row) await ctx.db.patch("billing", row._id, { tripsCreated: (row.tripsCreated ?? 0) + 1 });
  else await ctx.db.insert("billing", { userId, tripsCreated: 1, subscribed: false });
}

/** A trip can be started (used live) when its organizer is subscribed. */
export async function tripUnlocked(ctx: QueryCtx | MutationCtx, trip: Doc<"trips">) {
  return isSubscribed(ctx, trip.userId);
}

/** Throws (in the caller's language) unless the trip's organizer is subscribed. */
export async function requireStarted(ctx: QueryCtx | MutationCtx, trip: Doc<"trips">, userId: string) {
  if (await tripUnlocked(ctx, trip)) return;
  const t = translator(await languageOf(ctx, userId));
  throw new Error(t(trip.userId === userId ? "errors.subscribeToStart" : "errors.organizerMustSubscribe"));
}
