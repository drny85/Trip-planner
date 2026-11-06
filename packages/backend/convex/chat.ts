import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { findMembership, getCallerProfile, getMemberTrip, getOptionalUserId } from "./lib/auth";
import { cleanMessage, MAX_MESSAGE_LENGTH, MAX_PAGE, PAGE_SIZE, pushBody, shouldPush } from "./lib/chat";
import { listMembers } from "./lib/members";
import { myTrips } from "./trips";

/**
 * The trip's group chat. Everyone on the trip (owner and members) can read and
 * write it; nobody else can, not even with the share link. Chatting is part of
 * planning, so it's free and never behind the billing gate.
 */

/** What a message points at, shaped for the apps. `missing` means it was deleted since. */
export type ChatLink =
  | { kind: "activity"; id: Id<"activities">; title: string; subTripId: Id<"subTrips">; dayNumber: number; isCompleted: boolean; missing?: false }
  | { kind: "suggestion"; id: Id<"suggestions">; title: string; status: Doc<"suggestions">["status"]; missing?: false }
  | { kind: "activity" | "suggestion"; missing: true };

async function readRow(ctx: QueryCtx | MutationCtx, tripId: Id<"trips">, userId: string) {
  return ctx.db
    .query("chatReads")
    .withIndex("by_tripId_userId", (q) => q.eq("tripId", tripId).eq("userId", userId))
    .unique();
}

/** Messages from other people that came in after `since`, up to 100. */
async function countUnread(ctx: QueryCtx, tripId: Id<"trips">, userId: string, since: number) {
  const rows = await ctx.db
    .query("chatMessages")
    .withIndex("by_tripId", (q) => q.eq("tripId", tripId).gt("_creationTime", since))
    .take(100);
  return rows.filter((m) => m.authorId !== userId && !m.deletedAt).length;
}

async function linkFor(ctx: QueryCtx, m: Doc<"chatMessages">, dayNumbers: Map<string, number>): Promise<ChatLink | undefined> {
  if (m.activityId) {
    const a = await ctx.db.get("activities", m.activityId);
    if (!a || a.tripId !== m.tripId) return { kind: "activity", missing: true };
    let dayNumber = dayNumbers.get(a.subTripId);
    if (dayNumber === undefined) {
      dayNumber = (await ctx.db.get("subTrips", a.subTripId))?.dayNumber ?? 0;
      dayNumbers.set(a.subTripId, dayNumber);
    }
    return { kind: "activity", id: a._id, title: a.title, subTripId: a.subTripId, dayNumber, isCompleted: a.isCompleted };
  }
  if (m.suggestionId) {
    const s = await ctx.db.get("suggestions", m.suggestionId);
    if (!s || s.tripId !== m.tripId) return { kind: "suggestion", missing: true };
    return { kind: "suggestion", id: s._id, title: s.title, status: s.status };
  }
  return undefined;
}

/**
 * The latest `limit` messages, oldest first, with who wrote them and what they
 * link to. `readUpTo` is where the caller had read to, for a "New" divider.
 * Null when the caller isn't on the trip.
 */
export const list = query({
  args: { tripId: v.id("trips"), limit: v.optional(v.number()) },
  handler: async (ctx, { tripId, limit = PAGE_SIZE }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const take = Math.max(1, Math.min(Math.floor(limit), MAX_PAGE));
    const [rows, members, read] = await Promise.all([
      ctx.db
        .query("chatMessages")
        .withIndex("by_tripId", (q) => q.eq("tripId", tripId))
        .order("desc")
        .take(take + 1),
      listMembers(ctx, trip),
      readRow(ctx, tripId, userId),
    ]);
    const people = new Map(members.map((m) => [m.userId, m]));
    const dayNumbers = new Map<string, number>();
    const page = rows.slice(0, take).reverse();
    const messages = await Promise.all(
      page.map(async (m) => {
        const person = people.get(m.authorId);
        const deleted = Boolean(m.deletedAt);
        return {
          _id: m._id,
          _creationTime: m._creationTime,
          authorId: m.authorId,
          authorName: person?.name ?? m.authorName,
          authorImageUrl: person?.imageUrl,
          /** Still on the trip. */
          authorIsMember: Boolean(person),
          isMine: m.authorId === userId,
          text: deleted ? "" : m.text,
          deleted,
          link: deleted ? undefined : await linkFor(ctx, m, dayNumbers),
        };
      }),
    );
    return {
      messages,
      hasMore: rows.length > take,
      readUpTo: read?.lastReadAt ?? 0,
      muted: Boolean(read?.muted),
      isOwner: trip.userId === userId,
      memberCount: members.length,
    };
  },
});

/** How many chat messages the caller hasn't read on one trip (capped at 100). */
export const unread = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return 0;
    const read = await readRow(ctx, tripId, userId);
    return countUnread(ctx, tripId, userId, read?.lastReadAt ?? 0);
  },
});

/** Unread chat counts for each of the caller's trips that has any, for the trip lists. */
export const unreadByTrip = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (!userId) return {};
    const [trips, reads] = await Promise.all([
      myTrips(ctx, userId),
      ctx.db
        .query("chatReads")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    const readAt = new Map(reads.map((r) => [r.tripId, r.lastReadAt]));
    const counts: Record<string, number> = {};
    for (const trip of trips) {
      const n = await countUnread(ctx, trip._id, userId, readAt.get(trip._id) ?? 0);
      if (n > 0) counts[trip._id] = n;
    }
    return counts;
  },
});

/** Posts a message, optionally pointing at a stop or an idea on this trip, and pings the others. */
export const send = mutation({
  args: {
    tripId: v.id("trips"),
    text: v.string(),
    activityId: v.optional(v.id("activities")),
    suggestionId: v.optional(v.id("suggestions")),
  },
  handler: async (ctx, { tripId, text, activityId, suggestionId }): Promise<Id<"chatMessages">> => {
    const { trip, userId, member } = await getMemberTrip(ctx, tripId);
    const body = cleanMessage(text);
    if (!body) throw new Error("Write a message first");
    if (body.length > MAX_MESSAGE_LENGTH) throw new Error(`Messages can be up to ${MAX_MESSAGE_LENGTH} characters`);
    if (activityId && suggestionId) throw new Error("Link one thing at a time");
    if (activityId && (await ctx.db.get("activities", activityId))?.tripId !== tripId) throw new Error("That stop isn't on this trip");
    if (suggestionId && (await ctx.db.get("suggestions", suggestionId))?.tripId !== tripId) throw new Error("That idea isn't on this trip");

    // Older trips have no member row for the owner, so take the name from their sign-in.
    const authorName = "_id" in member ? member.name : (await getCallerProfile(ctx)).name;
    const id = await ctx.db.insert("chatMessages", { tripId, authorId: userId, authorName, text: body, activityId, suggestionId });
    const sentAt = (await ctx.db.get("chatMessages", id))!._creationTime;
    // Writing counts as reading up to here.
    await markReadAt(ctx, tripId, userId, sentAt);
    await pushToOthers(ctx, trip, userId, authorName, body, sentAt);
    return id;
  },
});

/** Marks the chat read up to now for the caller. */
export const markRead = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const { userId } = await getMemberTrip(ctx, tripId);
    const latest = await ctx.db
      .query("chatMessages")
      .withIndex("by_tripId", (q) => q.eq("tripId", tripId))
      .order("desc")
      .first();
    await markReadAt(ctx, tripId, userId, Math.max(Date.now(), latest?._creationTime ?? 0));
  },
});

/** Turns chat pushes for this trip off or back on, for the caller only. */
export const setMuted = mutation({
  args: { tripId: v.id("trips"), muted: v.boolean() },
  handler: async (ctx, { tripId, muted }) => {
    const { userId } = await getMemberTrip(ctx, tripId);
    const row = await readRow(ctx, tripId, userId);
    if (row) await ctx.db.patch("chatReads", row._id, { muted });
    else await ctx.db.insert("chatReads", { tripId, userId, lastReadAt: 0, muted });
  },
});

/** Takes a message back. Its author can, and so can the trip's organizer. */
export const remove = mutation({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get("chatMessages", messageId);
    if (!message) return;
    const { trip, userId } = await getMemberTrip(ctx, message.tripId);
    if (message.authorId !== userId && trip.userId !== userId) throw new Error("You can only delete your own messages");
    await ctx.db.patch("chatMessages", messageId, { deletedAt: Date.now(), text: "", activityId: undefined, suggestionId: undefined });
  },
});

async function markReadAt(ctx: MutationCtx, tripId: Id<"trips">, userId: string, at: number) {
  const row = await readRow(ctx, tripId, userId);
  if (!row) await ctx.db.insert("chatReads", { tripId, userId, lastReadAt: at });
  else if (row.lastReadAt < at) await ctx.db.patch("chatReads", row._id, { lastReadAt: at });
}

/** Sends a push to everyone else on the trip whose chat isn't muted or already buzzing. */
async function pushToOthers(ctx: MutationCtx, trip: Doc<"trips">, authorId: string, authorName: string, text: string, now: number) {
  const members = (await listMembers(ctx, trip)).filter((m) => m.userId !== authorId);
  const tokens: string[] = [];
  for (const m of members) {
    const read = await readRow(ctx, trip._id, m.userId);
    if (!shouldPush({ muted: read?.muted, lastReadAt: read?.lastReadAt ?? 0, lastPushAt: read?.lastPushAt, now })) continue;
    const phones = await ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", m.userId))
      .collect();
    if (phones.length === 0) continue;
    tokens.push(...phones.map((p) => p.token));
    if (read) await ctx.db.patch("chatReads", read._id, { lastPushAt: now });
    else await ctx.db.insert("chatReads", { tripId: trip._id, userId: m.userId, lastReadAt: 0, lastPushAt: now });
  }
  if (tokens.length > 0) {
    await ctx.scheduler.runAfter(0, internal.push.send, {
      tokens,
      title: trip.title,
      body: pushBody(authorName, text),
      data: { tripId: trip._id, screen: "chat" },
    });
  }
}

/** Removes a trip's whole chat. Used when the trip is deleted. */
export async function deleteTripChat(ctx: MutationCtx, tripId: Id<"trips">) {
  const [messages, reads] = await Promise.all([
    ctx.db
      .query("chatMessages")
      .withIndex("by_tripId", (q) => q.eq("tripId", tripId))
      .collect(),
    ctx.db
      .query("chatReads")
      .withIndex("by_tripId", (q) => q.eq("tripId", tripId))
      .collect(),
  ]);
  await Promise.all([...messages.map((m) => ctx.db.delete("chatMessages", m._id)), ...reads.map((r) => ctx.db.delete("chatReads", r._id))]);
}

/** Forgets someone's read state when they leave a trip; their messages stay, under their name. */
export async function forgetChatReader(ctx: MutationCtx, tripId: Id<"trips">, userId: string) {
  const row = await readRow(ctx, tripId, userId);
  if (row) await ctx.db.delete("chatReads", row._id);
}
