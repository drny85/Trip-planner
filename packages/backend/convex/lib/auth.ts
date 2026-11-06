import type { Doc, Id } from "../_generated/dataModel";
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

/** Display name and photo for the caller, from their sign-in identity, then their saved profile. */
export async function getCallerProfile(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  let name = identity?.name ?? identity?.givenName ?? identity?.nickname;
  let imageUrl = identity?.pictureUrl;
  if (identity && (!name || !imageUrl)) {
    const profile = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    name ??= profile?.name;
    imageUrl ??= profile?.imageUrl;
  }
  return { name: name ?? identity?.email?.split("@")[0] ?? "Traveler", imageUrl };
}

/** The caller's membership row for a trip, or null. The owner always counts as a member. */
export async function findMembership(ctx: QueryCtx | MutationCtx, trip: Doc<"trips">, userId: string) {
  const row = await ctx.db
    .query("tripMembers")
    .withIndex("by_tripId_userId", (q) => q.eq("tripId", trip._id).eq("userId", userId))
    .unique();
  if (row) return row;
  // Trips created before members existed have no owner row yet.
  if (trip.userId === userId) return { tripId: trip._id, userId, role: "owner" as const, name: "Owner" };
  return null;
}

/** Loads a trip and throws unless the caller is going on it (owner or member). */
export async function getMemberTrip(ctx: QueryCtx | MutationCtx, tripId: Id<"trips">) {
  const userId = await getUserId(ctx);
  const trip = await ctx.db.get("trips", tripId);
  const member = trip && (await findMembership(ctx, trip, userId));
  if (!trip || !member) throw new Error("Trip not found");
  return { trip, userId, member };
}

/** Like getOwnedActivity, but any member of the trip may act on it. */
export async function getMemberActivity(ctx: QueryCtx | MutationCtx, activityId: Id<"activities">) {
  const activity = await ctx.db.get("activities", activityId);
  if (!activity) throw new Error("Activity not found");
  return { activity, ...(await getMemberTrip(ctx, activity.tripId)) };
}
