import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** The activity and everything nested under it, at any depth. */
export async function subtree(ctx: QueryCtx | MutationCtx, root: Doc<"activities">): Promise<Doc<"activities">[]> {
  const all = [root];
  for (let i = 0; i < all.length; i++) {
    const children = await ctx.db
      .query("activities")
      .withIndex("by_parentId", (q) => q.eq("parentId", all[i]!._id))
      .collect();
    all.push(...children);
  }
  return all;
}
