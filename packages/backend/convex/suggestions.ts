import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { findMembership, getCallerProfile, getMemberTrip, getOptionalUserId } from "./lib/auth";
import { notify } from "./lib/notify";
import { isSubcategoryOf } from "./lib/categories";
import { decide, yesNeeded } from "./lib/majority";
import { activityFields } from "./lib/validators";
import { listMembers } from "./lib/members";

/**
 * Ideas members propose for the itinerary. The author's own vote counts as yes.
 * When more than half of the trip's members vote yes, the idea becomes a real
 * activity at the end of its day; once a majority is out of reach, it's dropped.
 */

const valueValidator = v.union(v.literal("yes"), v.literal("no"));

/** Open ideas with tallies and the caller's vote, plus the recently decided ones. */
export const forTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;

    const [members, open, accepted, rejected, votes] = await Promise.all([
      listMembers(ctx, trip),
      ctx.db.query("suggestions").withIndex("by_tripId_status", (q) => q.eq("tripId", tripId).eq("status", "open")).collect(),
      ctx.db.query("suggestions").withIndex("by_tripId_status", (q) => q.eq("tripId", tripId).eq("status", "accepted")).order("desc").take(5),
      ctx.db.query("suggestions").withIndex("by_tripId_status", (q) => q.eq("tripId", tripId).eq("status", "rejected")).order("desc").take(5),
      ctx.db.query("votes").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    const names = new Map(members.map((m) => [m.userId, m.name]));
    const shape = (s: Doc<"suggestions">) => {
      const mine = votes.filter((x) => x.suggestionId === s._id);
      const tally = { yes: mine.filter((x) => x.value === "yes").length, no: mine.filter((x) => x.value === "no").length, members: members.length };
      return {
        ...s,
        authorName: names.get(s.authorId) ?? "A former member",
        isMine: s.authorId === userId,
        myVote: mine.find((x) => x.userId === userId)?.value,
        tally,
        yesNeeded: yesNeeded(tally),
        voters: mine.map((x) => ({ name: names.get(x.userId) ?? "Someone", value: x.value })),
      };
    };
    return {
      open: open.map(shape),
      decided: [...accepted, ...rejected].sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0)).slice(0, 5).map(shape),
      memberCount: members.length,
    };
  },
});

/** Proposes an activity for a day. Returns the suggestion id (it may already be accepted on a solo trip). */
export const create = mutation({
  args: { subTripId: v.id("subTrips"), ...activityFields },
  handler: async (ctx, { subTripId, ...fields }) => {
    const subTrip = await ctx.db.get("subTrips", subTripId);
    if (!subTrip) throw new Error("Day not found");
    const { trip, userId } = await getMemberTrip(ctx, subTrip.tripId);
    if (!fields.title.trim()) throw new Error("Give the idea a title");
    const id = await ctx.db.insert("suggestions", {
      ...fields,
      title: fields.title.trim(),
      subcategory: fields.subcategory && isSubcategoryOf(fields.category ?? "other", fields.subcategory) ? fields.subcategory : undefined,
      tripId: trip._id,
      subTripId,
      authorId: userId,
      status: "open",
    });
    await ctx.db.insert("votes", { suggestionId: id, tripId: trip._id, userId, value: "yes" });
    const outcome = await resolve(ctx, trip, id);
    if (outcome === "open") {
      const { name } = await getCallerProfile(ctx);
      await notify(ctx, trip, { kind: "idea", actorId: userId, text: `${name.split(" ")[0]} suggested "${fields.title.trim()}". Cast your vote.` });
    }
    return id;
  },
});

/** Votes yes or no (voting again changes the vote). */
export const vote = mutation({
  args: { suggestionId: v.id("suggestions"), value: valueValidator },
  handler: async (ctx, { suggestionId, value }) => {
    const suggestion = await ctx.db.get("suggestions", suggestionId);
    if (!suggestion) throw new Error("Idea not found");
    const { trip, userId } = await getMemberTrip(ctx, suggestion.tripId);
    if (suggestion.status !== "open") throw new Error("Voting on this idea has closed");
    const existing = await ctx.db
      .query("votes")
      .withIndex("by_suggestionId_userId", (q) => q.eq("suggestionId", suggestionId).eq("userId", userId))
      .unique();
    if (existing) await ctx.db.patch("votes", existing._id, { value });
    else await ctx.db.insert("votes", { suggestionId, tripId: trip._id, userId, value });
    return resolve(ctx, trip, suggestionId);
  },
});

/** The author takes their idea back while it's still open. */
export const withdraw = mutation({
  args: { suggestionId: v.id("suggestions") },
  handler: async (ctx, { suggestionId }) => {
    const suggestion = await ctx.db.get("suggestions", suggestionId);
    if (!suggestion) throw new Error("Idea not found");
    const { userId } = await getMemberTrip(ctx, suggestion.tripId);
    if (suggestion.authorId !== userId) throw new Error("Only the person who suggested it can withdraw it");
    if (suggestion.status !== "open") return;
    await ctx.db.patch("suggestions", suggestionId, { status: "withdrawn", resolvedAt: Date.now() });
  },
});

/** Applies the majority rule to one open suggestion; adds the activity when it passes. */
async function resolve(ctx: MutationCtx, trip: Doc<"trips">, suggestionId: Doc<"suggestions">["_id"]) {
  const suggestion = await ctx.db.get("suggestions", suggestionId);
  if (!suggestion || suggestion.status !== "open") return suggestion?.status;
  const [members, votes] = await Promise.all([
    listMembers(ctx, trip),
    ctx.db.query("votes").withIndex("by_suggestionId", (q) => q.eq("suggestionId", suggestionId)).collect(),
  ]);
  const memberIds = new Set(members.map((m) => m.userId));
  const counted = votes.filter((x) => memberIds.has(x.userId));
  const outcome = decide({
    yes: counted.filter((x) => x.value === "yes").length,
    no: counted.filter((x) => x.value === "no").length,
    members: members.length,
  });
  if (outcome === "open") return outcome;

  let activityId;
  if (outcome === "accepted" && (await ctx.db.get("subTrips", suggestion.subTripId))) {
    const {
      _id: _sid, _creationTime: _ct, tripId, subTripId, authorId: _a, status: _s, resolvedAt: _r, activityId: _act,
      ...fields
    } = suggestion;
    const topLevel = await ctx.db
      .query("activities")
      .withIndex("by_subTripId_parentId_order", (q) => q.eq("subTripId", subTripId).eq("parentId", undefined))
      .collect();
    activityId = await ctx.db.insert("activities", {
      ...fields,
      tripId,
      subTripId,
      isCompleted: false,
      order: (topLevel.at(-1)?.order ?? -1) + 1,
    });
  }
  await ctx.db.patch("suggestions", suggestionId, { status: outcome, resolvedAt: Date.now(), activityId });
  if (members.length > 1) {
    await notify(ctx, trip, {
      kind: outcome,
      text: outcome === "accepted" ? `The group voted yes: "${suggestion.title}" is on the plan.` : `"${suggestion.title}" didn't get enough votes.`,
    });
  }
  return outcome;
}

/** Re-checks every open idea, e.g. after someone leaves and the majority changes. */
export async function resolveOpenSuggestions(ctx: MutationCtx, trip: Doc<"trips">) {
  const open = await ctx.db
    .query("suggestions")
    .withIndex("by_tripId_status", (q) => q.eq("tripId", trip._id).eq("status", "open"))
    .collect();
  for (const s of open) await resolve(ctx, trip, s._id);
}
