import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Everyone on a trip, owner first. Synthesizes the owner for trips made before members existed. */
export async function listMembers(ctx: QueryCtx | MutationCtx, trip: Doc<"trips">) {
  const rows = await ctx.db
    .query("tripMembers")
    .withIndex("by_tripId", (q) => q.eq("tripId", trip._id))
    .collect();
  const owner = rows.find((r) => r.userId === trip.userId);
  const others = rows.filter((r) => r.userId !== trip.userId);
  return [owner ?? { userId: trip.userId, role: "owner" as const, name: "Trip owner", imageUrl: undefined }, ...others];
}
