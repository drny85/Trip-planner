import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getCallerProfile } from "./auth";
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
    aiModel?: string;
  },
): Promise<Id<"trips">> {
  const { subTrips, ...trip } = args.tree;

  const tripId = await ctx.db.insert("trips", {
    ...trip,
    userId: args.userId,
    isAIGenerated: args.isAIGenerated,
    prompt: args.prompt,
    aiModel: args.aiModel,
  });
  // The owner is the first traveler, so votes count them too.
  const owner = await getCallerProfile(ctx);
  await ctx.db.insert("tripMembers", { tripId, userId: args.userId, role: "owner", ...owner });

  for (const [subIndex, subTrip] of subTrips.entries()) {
    const { activities, ...subTripFields } = subTrip;
    const subTripId = await ctx.db.insert("subTrips", {
      ...subTripFields,
      tripId,
      order: subIndex,
    });

    for (const [activityIndex, { subActivities, ...activity }] of activities.entries()) {
      const parentId = await ctx.db.insert("activities", {
        ...activity,
        tripId,
        subTripId,
        isCompleted: false,
        order: activityIndex,
      });
      for (const [childIndex, child] of (subActivities ?? []).entries()) {
        await ctx.db.insert("activities", {
          ...child,
          tripId,
          subTripId,
          parentId,
          isCompleted: false,
          order: childIndex,
        });
      }
    }
  }

  return tripId;
}
