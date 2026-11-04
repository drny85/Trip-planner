import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { TripTreeInput } from "./validators";

/**
 * Writes a whole Trip -> SubTrip -> Activity tree in one transaction.
 * Shared by the demo seed and (step 4) the AI generation action.
 */
export async function insertTripTree(
  ctx: MutationCtx,
  args: {
    userId: string;
    tree: TripTreeInput;
    isAIGenerated: boolean;
    prompt?: string;
  },
): Promise<Id<"trips">> {
  const { subTrips, ...trip } = args.tree;

  const tripId = await ctx.db.insert("trips", {
    ...trip,
    userId: args.userId,
    isAIGenerated: args.isAIGenerated,
    prompt: args.prompt,
  });

  for (const [subIndex, subTrip] of subTrips.entries()) {
    const { activities, ...subTripFields } = subTrip;
    const subTripId = await ctx.db.insert("subTrips", {
      ...subTripFields,
      tripId,
      order: subIndex,
    });

    for (const [activityIndex, activity] of activities.entries()) {
      await ctx.db.insert("activities", {
        ...activity,
        tripId,
        subTripId,
        isCompleted: false,
        order: activityIndex,
      });
    }
  }

  return tripId;
}
