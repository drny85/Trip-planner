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
    return insertTripTree(ctx, { userId, tree: tokyoAdventure, isAIGenerated: false });
  },
});
