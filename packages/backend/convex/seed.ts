import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { getUserId } from "./lib/auth";
import { tokyoAdventure } from "./lib/fakeData";
import { insertTripTree } from "./lib/insertTripTree";

/**
 * Inserts the fake "Tokyo Adventure" trip for the current user and returns its id.
 * Run with `pnpm --filter @trip/backend seed`, or call it from a "Load demo trip" button.
 */
export const demoTrip = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const tripId = await insertTripTree(ctx, { userId, tree: tokyoAdventure, isAIGenerated: false });
    // Swap in real photos of each place where Wikipedia has a good one.
    await ctx.scheduler.runAfter(0, internal.photos.enrichTrip, { tripId });
    return tripId;
  },
});
