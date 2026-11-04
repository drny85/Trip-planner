import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Used until Clerk is wired up (step 3), so the app works with no keys.
 * Once auth is on, remove the fallback in `getUserId` so anonymous calls fail.
 */
export const DEMO_USER_ID = "demo-user";

export async function getUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? DEMO_USER_ID;
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
