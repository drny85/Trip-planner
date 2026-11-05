import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { findMembership, getCallerProfile, getMemberTrip, getOptionalUserId, getOwnedTrip, getUserId } from "./lib/auth";
import { notify } from "./lib/notify";
import { newToken } from "./lib/tokens";
import { listMembers } from "./lib/members";
import { resolveOpenSuggestions } from "./suggestions";

/**
 * Trip members: the owner invites friends with a link, friends join with it, and
 * everyone on the trip can see it, check things off, suggest ideas and vote.
 */

export const forTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const members = await listMembers(ctx, trip);
    return {
      members: members.map((m) => ({ userId: m.userId, name: m.name, imageUrl: m.imageUrl, role: m.role, isMe: m.userId === userId })),
      isOwner: trip.userId === userId,
      inviteToken: trip.userId === userId ? trip.inviteToken : undefined,
    };
  },
});

/** Turns on the invite link (or returns the current one). Owner only. */
export const createInvite = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await getOwnedTrip(ctx, tripId);
    if (trip.inviteToken) return trip.inviteToken;
    const inviteToken = newToken();
    await ctx.db.patch("trips", tripId, { inviteToken });
    return inviteToken;
  },
});

/** Turns the invite link off; people who already joined stay. Owner only. */
export const revokeInvite = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await getOwnedTrip(ctx, tripId);
    await ctx.db.patch("trips", tripId, { inviteToken: undefined });
  },
});

async function tripForInvite(ctx: QueryCtx | MutationCtx, token: string) {
  if (token.length < 16) return null;
  return ctx.db
    .query("trips")
    .withIndex("by_inviteToken", (q) => q.eq("inviteToken", token))
    .unique();
}

/** What an invite link shows before joining. Public: anyone with the link can see this much. */
export const invitePreview = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const trip = await tripForInvite(ctx, token);
    if (!trip) return null;
    const userId = await getOptionalUserId(ctx);
    const members = await listMembers(ctx, trip);
    return {
      tripId: trip._id,
      title: trip.title,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      imageUrl: trip.imageUrl,
      ownerName: members[0]!.name,
      memberNames: members.map((m) => m.name),
      alreadyMember: Boolean(userId && members.some((m) => m.userId === userId)),
      signedIn: Boolean(userId),
    };
  },
});

/** Joins the trip behind an invite link and returns its id. */
export const join = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<Id<"trips">> => {
    const userId = await getUserId(ctx);
    const trip = await tripForInvite(ctx, token);
    if (!trip) throw new Error("This invite link isn't active anymore");
    if (await findMembership(ctx, trip, userId)) return trip._id;
    const profile = await getCallerProfile(ctx);
    await ctx.db.insert("tripMembers", { tripId: trip._id, userId, role: "member", ...profile });
    await notify(ctx, trip, { kind: "joined", actorId: userId, text: `${profile.name} joined the trip.` });
    return trip._id;
  },
});

/** Leaves a trip. The owner can't leave their own trip (they can delete it). */
export const leave = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const { trip, userId } = await getMemberTrip(ctx, tripId);
    if (trip.userId === userId) throw new Error("The owner can't leave their own trip");
    await removeMember(ctx, trip, userId);
  },
});

/** Removes someone from the trip. Owner only. */
export const remove = mutation({
  args: { tripId: v.id("trips"), userId: v.string() },
  handler: async (ctx, { tripId, userId }) => {
    const trip = await getOwnedTrip(ctx, tripId);
    if (userId === trip.userId) throw new Error("The owner can't be removed");
    await removeMember(ctx, trip, userId);
  },
});

async function removeMember(ctx: MutationCtx, trip: Doc<"trips">, userId: string) {
  const row = await ctx.db
    .query("tripMembers")
    .withIndex("by_tripId_userId", (q) => q.eq("tripId", trip._id).eq("userId", userId))
    .unique();
  if (row) await ctx.db.delete("tripMembers", row._id);
  // Their votes go with them, and fewer members can change what a majority is.
  const votes = await ctx.db
    .query("votes")
    .withIndex("by_tripId", (q) => q.eq("tripId", trip._id))
    .collect();
  await Promise.all(votes.filter((vote) => vote.userId === userId).map((vote) => ctx.db.delete("votes", vote._id)));
  await resolveOpenSuggestions(ctx, trip);
}
