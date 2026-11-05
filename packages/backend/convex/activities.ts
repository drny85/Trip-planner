import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { getMemberActivity, getOwnedActivity, getOwnedTrip } from "./lib/auth";
import { isSubcategoryOf } from "./lib/categories";
import { deleteMemory } from "./memories";
import { activityFields } from "./lib/validators";

/** Drops a subcategory that doesn't belong under the activity's category. */
const checkedSubcategory = (category: Doc<"activities">["category"], subcategory?: string) =>
  subcategory && isSubcategoryOf(category ?? "other", subcategory) ? subcategory : undefined;

/** The activity and everything nested under it, at any depth. */
async function subtree(ctx: MutationCtx, root: Doc<"activities">): Promise<Doc<"activities">[]> {
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

/** Siblings in display order: same day, same parent (top level when parentId is undefined). */
const siblings = (ctx: MutationCtx, subTripId: Id<"subTrips">, parentId: Id<"activities"> | undefined) =>
  ctx.db
    .query("activities")
    .withIndex("by_subTripId_parentId_order", (q) => q.eq("subTripId", subTripId).eq("parentId", parentId))
    .collect();

/** Rewrites `order` to 0..n-1, touching only rows that changed. */
const renumber = (ctx: MutationCtx, rows: Doc<"activities">[], extra: Partial<Doc<"activities">> = {}) =>
  Promise.all(
    rows.map((a, order) => {
      const changed = a.order !== order || Object.entries(extra).some(([k, val]) => a[k as keyof typeof a] !== val);
      return changed ? ctx.db.patch("activities", a._id, { ...extra, order }) : null;
    }),
  );

/**
 * Marks an activity done or not done. Done also completes everything nested under
 * it; not done also reopens its ancestors (a parent can't be done with open steps).
 */
export const setCompleted = mutation({
  args: { activityId: v.id("activities"), isCompleted: v.boolean() },
  handler: async (ctx, { activityId, isCompleted }) => {
    // Anyone on the trip can check things off.
    const { activity } = await getMemberActivity(ctx, activityId);
    const completedAt = isCompleted ? Date.now() : undefined;
    const targets = isCompleted ? await subtree(ctx, activity) : [activity];
    if (!isCompleted) {
      for (let id = activity.parentId; id; ) {
        const parent = await ctx.db.get("activities", id);
        if (!parent) break;
        targets.push(parent);
        id = parent.parentId;
      }
    }
    await Promise.all(
      targets
        .filter((a) => a.isCompleted !== isCompleted)
        .map((a) => ctx.db.patch("activities", a._id, { isCompleted, completedAt })),
    );
  },
});

/** Partial edit of an activity's details (inline edit or the edit sheet). */
export const update = mutation({
  args: {
    activityId: v.id("activities"),
    patch: v.object({
      ...activityFields,
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      address: v.optional(v.string()),
      photoUrl: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { activityId, patch }) => {
    const activity = await getOwnedActivity(ctx, activityId);
    const next = { ...patch };
    // Changing the category clears a subcategory that no longer fits; "" clears it on purpose.
    if (patch.category !== undefined || patch.subcategory !== undefined) {
      next.subcategory = checkedSubcategory(patch.category ?? activity.category, patch.subcategory ?? activity.subcategory);
    }
    await ctx.db.patch("activities", activityId, next);
  },
});

/** Adds an activity at the end of a day, or as the last sub-activity of `parentId`. */
export const create = mutation({
  args: { subTripId: v.id("subTrips"), parentId: v.optional(v.id("activities")), ...activityFields },
  handler: async (ctx, { subTripId, parentId, ...fields }) => {
    const subTrip = await ctx.db.get("subTrips", subTripId);
    if (!subTrip) throw new Error("Day not found");
    await getOwnedTrip(ctx, subTrip.tripId);
    if (parentId) {
      const parent = await getOwnedActivity(ctx, parentId);
      if (parent.subTripId !== subTripId) throw new Error("A sub-activity must be on the same day as its parent");
    }

    const existing = await siblings(ctx, subTripId, parentId);
    return ctx.db.insert("activities", {
      ...fields,
      subcategory: checkedSubcategory(fields.category, fields.subcategory),
      subTripId,
      parentId,
      tripId: subTrip.tripId,
      isCompleted: false,
      order: (existing.at(-1)?.order ?? -1) + 1,
    });
  },
});

/**
 * Moves an activity (with everything nested under it) to `toIndex` among the
 * children of `toParentId` on `toSubTripId`. Leave `toParentId` out to move it to
 * the top level of that day. Siblings on both sides are renumbered.
 */
export const move = mutation({
  args: {
    activityId: v.id("activities"),
    toSubTripId: v.id("subTrips"),
    toIndex: v.number(),
    toParentId: v.optional(v.id("activities")),
  },
  handler: async (ctx, { activityId, toSubTripId, toIndex, toParentId }) => {
    const activity = await getOwnedActivity(ctx, activityId);
    const target = await ctx.db.get("subTrips", toSubTripId);
    if (!target || target.tripId !== activity.tripId) throw new Error("Day not found");

    const tree = await subtree(ctx, activity);
    if (toParentId) {
      if (tree.some((a) => a._id === toParentId)) throw new Error("Can't move an activity inside itself");
      const parent = await getOwnedActivity(ctx, toParentId);
      if (parent.subTripId !== toSubTripId) throw new Error("Parent is on a different day");
    }

    const sameList = activity.subTripId === toSubTripId && activity.parentId === toParentId;
    const source = (await siblings(ctx, activity.subTripId, activity.parentId)).filter((a) => a._id !== activityId);
    const dest = sameList ? source : await siblings(ctx, toSubTripId, toParentId);
    dest.splice(Math.max(0, Math.min(toIndex, dest.length)), 0, activity);

    await renumber(ctx, dest, { subTripId: toSubTripId, parentId: toParentId });
    if (!sameList) await renumber(ctx, source);
    // Descendants follow their parent to the new day.
    if (activity.subTripId !== toSubTripId) {
      await Promise.all(tree.slice(1).map((a) => ctx.db.patch("activities", a._id, { subTripId: toSubTripId })));
    }
  },
});

/** Deletes an activity and everything nested under it. */
export const remove = mutation({
  args: { activityId: v.id("activities") },
  handler: async (ctx, { activityId }) => {
    const activity = await getOwnedActivity(ctx, activityId);
    const tree = await subtree(ctx, activity);
    // Photos attached to these activities go with them.
    for (const a of tree) {
      const photos = await ctx.db.query("memories").withIndex("by_activityId", (q) => q.eq("activityId", a._id)).collect();
      await Promise.all(photos.map((m) => deleteMemory(ctx, m._id, m.storageId)));
    }
    await Promise.all(tree.map((a) => ctx.db.delete("activities", a._id)));
    await renumber(ctx, await siblings(ctx, activity.subTripId, activity.parentId));
  },
});
