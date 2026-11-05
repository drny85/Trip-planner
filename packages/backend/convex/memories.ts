import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { findMembership, getMemberActivity, getMemberTrip, getOptionalUserId, getUserId } from "./lib/auth";
import { listMembers } from "./lib/members";

/**
 * Memories: photos anyone on the trip attaches to an activity. Upload flow:
 * `generateUploadUrl` -> POST the file to it -> `add` with the returned storageId.
 */

const MAX_BYTES = 15 * 1024 * 1024;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getUserId(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/** Attaches an uploaded photo to an activity. Rejects files that aren't images or are too big. */
export const add = mutation({
  args: { activityId: v.id("activities"), storageId: v.id("_storage"), caption: v.optional(v.string()) },
  handler: async (ctx, { activityId, storageId, caption }) => {
    const { activity, userId } = await getMemberActivity(ctx, activityId);
    const file = await ctx.db.system.get("_storage", storageId);
    if (!file) throw new Error("Upload not found");
    const bad = !file.contentType?.startsWith("image/") || file.size > MAX_BYTES;
    // Each upload can be attached once, so a storage id can't be reused across trips.
    const taken = await ctx.db
      .query("memories")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .first();
    if (bad || taken) {
      if (bad) await ctx.storage.delete(storageId);
      throw new Error(bad ? "Photos must be images under 15 MB" : "That photo is already attached");
    }
    return ctx.db.insert("memories", {
      tripId: activity.tripId,
      activityId,
      storageId,
      uploadedBy: userId,
      caption: caption?.trim() || undefined,
    });
  },
});

export const setCaption = mutation({
  args: { memoryId: v.id("memories"), caption: v.string() },
  handler: async (ctx, { memoryId, caption }) => {
    const memory = await ctx.db.get("memories", memoryId);
    if (!memory) throw new Error("Photo not found");
    await getMemberTrip(ctx, memory.tripId);
    await ctx.db.patch("memories", memoryId, { caption: caption.trim() || undefined });
  },
});

/** The uploader or the organizer can delete a photo. */
export const remove = mutation({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, { memoryId }) => {
    const memory = await ctx.db.get("memories", memoryId);
    if (!memory) return;
    const { trip, userId } = await getMemberTrip(ctx, memory.tripId);
    if (memory.uploadedBy !== userId && trip.userId !== userId) throw new Error("Only the person who added it or the organizer can delete it");
    await deleteMemory(ctx, memory._id, memory.storageId);
  },
});

export async function deleteMemory(ctx: MutationCtx, memoryId: Id<"memories">, storageId: Id<"_storage">) {
  await ctx.db.delete("memories", memoryId);
  await ctx.storage.delete(storageId);
}

/** Every photo on the trip, newest first, with URLs and who added it. */
export const forTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const [rows, members] = await Promise.all([
      ctx.db.query("memories").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).order("desc").collect(),
      listMembers(ctx, trip),
    ]);
    const names = new Map(members.map((m) => [m.userId, m.name]));
    const photos = await Promise.all(
      rows.map(async (m) => {
        // The activity may have moved days since; read where it is now.
        const activity = await ctx.db.get("activities", m.activityId);
        return {
        _id: m._id,
        _creationTime: m._creationTime,
        activityId: m.activityId,
        activityTitle: activity?.title ?? "",
        subTripId: activity?.subTripId,
        caption: m.caption,
        url: await ctx.storage.getUrl(m.storageId),
        uploaderName: names.get(m.uploadedBy) ?? "A former member",
        canDelete: m.uploadedBy === userId || trip.userId === userId,
        };
      }),
    );
    return photos.filter((p): p is typeof p & { url: string } => p.url !== null);
  },
});
