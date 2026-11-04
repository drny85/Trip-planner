import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Demo mode: until CLERK_JWT_ISSUER_DOMAIN is set on the deployment, every
 * caller is treated as this user, so the apps work with no keys at all.
 * Once Clerk is configured, anonymous calls are rejected.
 */
export const DEMO_USER_ID = "demo-user";

export const authEnabled = () => Boolean(process.env.CLERK_JWT_ISSUER_DOMAIN);

/** The caller's user id, or null when auth is on and nobody is signed in. */
export async function getOptionalUserId(
  ctx: Pick<QueryCtx | MutationCtx | ActionCtx, "auth">,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) return identity.subject;
  return authEnabled() ? null : DEMO_USER_ID;
}

/** Like getOptionalUserId but throws when nobody is signed in. Use in mutations and actions. */
export async function getUserId(
  ctx: Pick<QueryCtx | MutationCtx | ActionCtx, "auth">,
): Promise<string> {
  const userId = await getOptionalUserId(ctx);
  if (!userId) throw new Error("Not signed in");
  return userId;
}

/** Loads a trip and throws unless it belongs to the caller. */
export async function getOwnedTrip(ctx: QueryCtx | MutationCtx, tripId: Id<"trips">) {
  const userId = await getUserId(ctx);
  const trip = await ctx.db.get("trips", tripId);
  if (!trip || trip.userId !== userId) throw new Error("Trip not found");
  return trip;
}

export async function getOwnedActivity(
  ctx: QueryCtx | MutationCtx,
  activityId: Id<"activities">,
) {
  const activity = await ctx.db.get("activities", activityId);
  if (!activity) throw new Error("Activity not found");
  await getOwnedTrip(ctx, activity.tripId);
  return activity;
}
