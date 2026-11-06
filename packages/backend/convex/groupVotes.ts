import { isLocale, translator, type Locale } from "@trip/i18n";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { aiVia, generateStructured, languageInstruction } from "./ai";
import { subtree } from "./lib/subtree";
import { deleteNotesFor } from "./journal";
import { deleteMemory } from "./memories";
import { findMembership, getCallerProfile, getMemberActivity, getOptionalUserId, getOwnedTrip, getUserId } from "./lib/auth";
import {
  checkPlan,
  type CheckedPlan,
  fairRanking,
  firstPicks,
  isDropCandidate,
  MAX_PICKS,
  type PlanInputDay,
  tallyVotes,
  type VoteRow,
  votesOnlyPlan,
} from "./lib/groupVotes";
import { listMembers } from "./lib/members";
import { nextTier, type Tier } from "./lib/modelRouter";
import { languageOf, notify } from "./lib/notify";

/**
 * Group voting on the itinerary. Everyone on the trip votes 👍/👎 on stops and
 * stars a top 3; the organizer then has the AI rebuild the plan around what the
 * group likes most, previews it, and applies it. Rules: lib/groupVotes.ts.
 */

/** Transport (flights, trains) isn't up for a vote; everything else at the top level of a day is. */
const isVotable = (a: Doc<"activities">) => !a.parentId && a.category !== "transport";

const voteRows = (rows: Doc<"activityVotes">[]): VoteRow[] =>
  rows.map((r) => ({ activityId: r.activityId, userId: r.userId, value: r.value, pick: r.pick }));

async function tripVotes(ctx: QueryCtx, tripId: Id<"trips">) {
  return ctx.db.query("activityVotes").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect();
}

/** Top-level stops in itinerary order, day by day. */
async function orderedStops(ctx: QueryCtx, tripId: Id<"trips">) {
  const [days, activities] = await Promise.all([
    ctx.db.query("subTrips").withIndex("by_tripId_order", (q) => q.eq("tripId", tripId)).collect(),
    ctx.db.query("activities").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
  ]);
  return days.map((day) => ({
    day,
    stops: activities.filter((a) => a.subTripId === day._id && !a.parentId).sort((a, b) => a.order - b.order),
  }));
}

/** Everything the trip page shows about the votes. Null for people not on the trip. */
export const forTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const [members, rows, days] = await Promise.all([listMembers(ctx, trip), tripVotes(ctx, tripId), orderedStops(ctx, tripId)]);
    const memberIds = members.map((m) => m.userId);
    const names = new Map(members.map((m) => [m.userId, m.name.split(" ")[0] ?? m.name]));
    const votes = voteRows(rows).filter((r) => names.has(r.userId));
    const tallies = tallyVotes(votes, memberIds);
    const votable = days.flatMap((d) => d.stops.filter(isVotable));
    const ranking = fairRanking(
      votable.map((a) => a._id as string),
      tallies,
      votes,
    ).filter((r) => {
      const t = tallies.get(r.activityId);
      return t && t.up + t.down > 0;
    });
    const mine = votes.filter((x) => x.userId === userId);
    const keep = firstPicks(votes, memberIds);

    const byActivity: Record<
      string,
      { up: number; down: number; picks: number; score: number; myVote?: "up" | "down"; myPick?: number; voters: { name: string; value?: "up" | "down"; pick?: number }[]; votedOut: boolean; isFirstPick: boolean }
    > = {};
    for (const a of votable) {
      const t = tallies.get(a._id);
      const me = mine.find((x) => x.activityId === a._id);
      byActivity[a._id] = {
        up: t?.up ?? 0,
        down: t?.down ?? 0,
        picks: t?.picks ?? 0,
        score: t?.score ?? 0,
        myVote: me?.pick ? "up" : me?.value,
        myPick: me?.pick,
        voters: votes.filter((x) => x.activityId === a._id).map((x) => ({ name: names.get(x.userId)!, value: x.pick ? "up" : x.value, pick: x.pick })),
        votedOut: isDropCandidate(t, members.length),
        isFirstPick: keep.has(a._id),
      };
    }

    return {
      memberCount: members.length,
      /** People who've voted on at least one stop. */
      voterCount: new Set(votes.map((x) => x.userId)).size,
      voted: [...new Set(votes.map((x) => x.userId))].map((id) => names.get(id)!),
      isOwner: trip.userId === userId,
      picksLeft: MAX_PICKS - mine.filter((x) => x.pick).length,
      /** Most wanted first, only stops someone voted on. */
      ranking: ranking.slice(0, 10).map((r) => ({ ...r, ...byActivity[r.activityId]! })),
      votedOutCount: Object.values(byActivity).filter((x) => x.votedOut).length,
      byActivity,
    };
  },
});

async function votableActivity(ctx: MutationCtx, activityId: Id<"activities">) {
  const { activity, userId } = await getMemberActivity(ctx, activityId);
  const t = translator(await languageOf(ctx, userId));
  if (!isVotable(activity)) throw new Error(t("errors.voteNotVotable"));
  const row = await ctx.db
    .query("activityVotes")
    .withIndex("by_activityId_userId", (q) => q.eq("activityId", activityId).eq("userId", userId))
    .unique();
  return { activity, userId, row, t };
}

/** Closes the gaps in someone's pick ranks after one is removed (1, 3 → 1, 2). */
async function renumberPicks(ctx: MutationCtx, tripId: Id<"trips">, userId: string) {
  const rows = await ctx.db
    .query("activityVotes")
    .withIndex("by_tripId_userId", (q) => q.eq("tripId", tripId).eq("userId", userId))
    .collect();
  const picked = rows.filter((r) => r.pick).sort((a, b) => a.pick! - b.pick!);
  await Promise.all(picked.map((r, i) => (r.pick !== i + 1 ? ctx.db.patch("activityVotes", r._id, { pick: i + 1 }) : null)));
}

/** Saves a row, or deletes it once it holds no vote at all. */
async function save(ctx: MutationCtx, row: Doc<"activityVotes"> | null, base: { tripId: Id<"trips">; activityId: Id<"activities">; userId: string }, patch: { value?: "up" | "down"; pick?: number }) {
  if (!patch.value && !patch.pick) {
    if (row) await ctx.db.delete("activityVotes", row._id);
  } else if (row) await ctx.db.patch("activityVotes", row._id, patch);
  else await ctx.db.insert("activityVotes", { ...base, ...patch });
}

/** 👍, 👎, or null to clear. A 👎 also takes away a top-pick star. */
export const vote = mutation({
  args: { activityId: v.id("activities"), value: v.union(v.literal("up"), v.literal("down"), v.null()) },
  handler: async (ctx, { activityId, value }) => {
    const { activity, userId, row } = await votableActivity(ctx, activityId);
    const base = { tripId: activity.tripId, activityId, userId };
    const hadPick = Boolean(row?.pick);
    const keepPick = value === "up" ? row?.pick : undefined;
    await save(ctx, row, base, { value: value ?? undefined, pick: keepPick });
    if (hadPick && !keepPick) await renumberPicks(ctx, activity.tripId, userId);
  },
});

/** Stars a stop as one of your top 3 (ranked in the order you star them), or un-stars it. */
export const setPick = mutation({
  args: { activityId: v.id("activities"), picked: v.boolean() },
  handler: async (ctx, { activityId, picked }) => {
    const { activity, userId, row, t } = await votableActivity(ctx, activityId);
    const base = { tripId: activity.tripId, activityId, userId };
    if (picked) {
      if (row?.pick) return row.pick;
      const mine = await ctx.db
        .query("activityVotes")
        .withIndex("by_tripId_userId", (q) => q.eq("tripId", activity.tripId).eq("userId", userId))
        .collect();
      const used = mine.filter((r) => r.pick).length;
      if (used >= MAX_PICKS) throw new Error(t("errors.votePicksFull", { max: MAX_PICKS }));
      await save(ctx, row, base, { value: "up", pick: used + 1 });
      return used + 1;
    }
    if (!row?.pick) return null;
    await save(ctx, row, base, { value: "up", pick: undefined });
    await renumberPicks(ctx, activity.tripId, userId);
    return null;
  },
});

/** Deletes the votes on these activities. Called when activities are deleted. */
export async function deleteVotesFor(ctx: MutationCtx, tripId: Id<"trips">, activityIds: Id<"activities">[]) {
  if (activityIds.length === 0) return;
  const gone = new Set<string>(activityIds);
  const rows = await ctx.db.query("activityVotes").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect();
  const users = new Set<string>();
  for (const r of rows) {
    if (!gone.has(r.activityId)) continue;
    if (r.pick) users.add(r.userId);
    await ctx.db.delete("activityVotes", r._id);
  }
  for (const u of users) await renumberPicks(ctx, tripId, u);
}

/** Deletes someone's votes on a trip (they left or were removed), or everyone's when `userId` is left out. */
export async function deleteTripVotes(ctx: MutationCtx, tripId: Id<"trips">, userId?: string) {
  const rows = userId
    ? await ctx.db.query("activityVotes").withIndex("by_tripId_userId", (q) => q.eq("tripId", tripId).eq("userId", userId)).collect()
    : await ctx.db.query("activityVotes").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect();
  await Promise.all(rows.map((r) => ctx.db.delete("activityVotes", r._id)));
}

// ---------------------------------------------------------------- AI plan

type StopForModel = {
  id: string;
  title: string;
  category: string;
  startTime?: string;
  durationMinutes?: number;
  address: string;
  /** Can't change day (done, booked, a hotel or transport). */
  fixedDay: boolean;
  done: boolean;
  score: number;
  up: number;
  down: number;
  topPicks: number;
  /** Someone's #1 pick: must stay. */
  mustKeep: boolean;
  /** The group voted it out: may be dropped. */
  mayDrop: boolean;
};

export type PlanInput = {
  tripTitle: string;
  destination: string;
  memberCount: number;
  voterCount: number;
  days: { id: string; dayNumber: number; date?: string; location?: string; title: string; stops: StopForModel[] }[];
  /** Most wanted first. */
  ranking: { id: string; rank: number; tieBrokenBy?: string }[];
};

/** The trip as the model reads it, with the votes on every stop. Organizer only. */
export const planInput = internalQuery({
  args: { tripId: v.id("trips"), userId: v.string() },
  handler: async (ctx, { tripId, userId }): Promise<PlanInput | null> => {
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || trip.userId !== userId) return null;
    return loadPlanInput(ctx, trip);
  },
});

async function loadPlanInput(ctx: QueryCtx, trip: Doc<"trips">): Promise<PlanInput> {
    const tripId = trip._id;
    const [members, rows, days, bookings] = await Promise.all([
      listMembers(ctx, trip),
      tripVotes(ctx, tripId),
      orderedStops(ctx, tripId),
      ctx.db.query("bookings").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    const memberIds = members.map((m) => m.userId);
    const votes = voteRows(rows);
    const tallies = tallyVotes(votes, memberIds);
    const keep = firstPicks(votes, memberIds);
    const booked = new Set(bookings.flatMap((b) => (b.activityId ? [b.activityId as string] : [])));
    const ranking = fairRanking(
      days.flatMap((d) => d.stops.filter(isVotable).map((a) => a._id as string)),
      tallies,
      votes,
    );
    return {
      tripTitle: trip.title,
      destination: trip.destination,
      memberCount: members.length,
      voterCount: new Set(votes.filter((x) => memberIds.includes(x.userId)).map((x) => x.userId)).size,
      ranking: ranking.map((r) => ({ id: r.activityId, rank: r.rank, tieBrokenBy: r.tieBrokenBy })),
      days: days.map(({ day, stops }) => ({
        id: day._id,
        dayNumber: day.dayNumber,
        date: day.date,
        location: day.location,
        title: day.title,
        stops: stops.map((a) => {
          const t = tallies.get(a._id);
          return {
            id: a._id,
            title: a.title,
            category: a.category ?? "other",
            startTime: a.startTime,
            durationMinutes: a.durationMinutes,
            address: a.address,
            fixedDay: a.isCompleted || booked.has(a._id) || a.category === "lodging" || a.category === "transport",
            done: a.isCompleted,
            score: t?.score ?? 0,
            up: t?.up ?? 0,
            down: t?.down ?? 0,
            topPicks: t?.picks ?? 0,
            mustKeep: keep.has(a._id),
            mayDrop: isVotable(a) && !a.isCompleted && !booked.has(a._id) && isDropCandidate(t, members.length),
          };
        }),
      })),
    };
}

const toPlanDays = (input: PlanInput): PlanInputDay[] =>
  input.days.map((d) => ({ id: d.id, activities: d.stops.map((s) => ({ id: s.id, locked: s.fixedDay, done: s.done, startTime: s.startTime })) }));
const droppableIn = (input: PlanInput) => new Set(input.days.flatMap((d) => d.stops.filter((s) => s.mayDrop).map((s) => s.id)));

const PLAN_PROMPT = `You are an expert travel planner rebuilding a group trip around how the group voted on each stop.

Each stop has the group's votes: score (higher is more wanted), up, down, topPicks (people who starred it as a top-3 favorite), and a rank (1 = most wanted overall; ties were already broken fairly).
- Build each day around the most wanted stops: give them the best time slots (e.g. a favorite viewpoint at sunset, a favorite restaurant at dinner time) and don't rush them.
- Keep every stop with "mustKeep": true. It's someone's #1 pick.
- You may drop a stop only when "mayDrop": true (the group voted it down). Give each dropped stop a short, kind reason that mentions the votes. Never drop anything else.
- You may move a stop to another day when that fits the group's favorites better (for example, to pair it with a nearby favorite), except stops with "fixedDay": true, which stay on their day. Stops with "done": true stay exactly as they are.
- Keep days realistic: sensible order and travel time, meals at normal times, and about the same number of stops per day as before.
- Every stop that isn't dropped must appear exactly once, using its id. Don't invent new stops.
- Give every stop a start time ("HH:mm", 24h).
- The summary is two short sentences for the whole group: what changed and which favorites the plan is built around. Be fair and warm; don't single anyone out.`;

const planSchema = z.object({
  summary: z.string().describe("Two short sentences for the group on what changed and why"),
  days: z
    .array(
      z.object({
        dayId: z.string().describe("The day's id, as given"),
        activities: z.array(z.object({ id: z.string().describe("The stop's id, as given"), startTime: z.string().describe("HH:mm, 24h") })).describe("In the order they happen"),
      }),
    )
    .describe("Every day, as given, with its stops"),
  dropped: z.array(z.object({ id: z.string(), reason: z.string().describe("One short sentence") })).describe("Stops left out; only ones with mayDrop"),
});

export function planPrompt(input: PlanInput) {
  const rank = new Map(input.ranking.map((r) => [r.id, r.rank]));
  const days = input.days.map((d) => ({
    dayId: d.id,
    day: d.dayNumber,
    date: d.date,
    location: d.location,
    title: d.title,
    stops: d.stops.map(({ id, ...s }) => ({ id, ...s, rank: rank.get(id) })),
  }));
  return `Trip: ${input.tripTitle} in ${input.destination}. ${input.memberCount} travelers, ${input.voterCount} of them voted.\n\nCurrent plan with votes (JSON):\n${JSON.stringify(days)}`;
}

export type GroupPlan = CheckedPlan & {
  /** Null when no AI is set up: the plan then only removes what the group voted out. */
  summary: string | null;
  model: string;
};

const planResult = v.object({
  summary: v.union(v.string(), v.null()),
  model: v.string(),
  days: v.array(v.object({ subTripId: v.string(), items: v.array(v.object({ activityId: v.string(), startTime: v.optional(v.string()), movedFrom: v.optional(v.string()) })) })),
  dropped: v.array(v.object({ activityId: v.string(), reason: v.optional(v.string()) })),
});

/**
 * Has the AI rebuild the itinerary around the group's votes. Organizer only.
 * Returns a proposal; nothing changes until they apply it with `applyPlan`.
 * Whatever the model says goes through `checkPlan`, so the fairness rules hold.
 */
export const buildPlan = action({
  args: { tripId: v.id("trips"), language: v.optional(v.string()) },
  returns: planResult,
  handler: async (ctx, { tripId, language }): Promise<GroupPlan> => {
    const userId = await getUserId(ctx);
    const locale: Locale = isLocale(language) ? language : "en";
    const t = translator(locale);
    const input: PlanInput | null = await ctx.runQuery(internal.groupVotes.planInput, { tripId, userId });
    if (!input) throw new Error(t("errors.organizerOnly"));
    if (input.voterCount === 0) throw new Error(t("errors.voteNoVotes"));
    const planDays = toPlanDays(input);
    const droppable = droppableIn(input);

    const via = aiVia();
    if (!via) return { ...votesOnlyPlan(planDays, droppable), summary: null, model: "votes" };

    const content = planPrompt(input);
    const spec = { system: PLAN_PROMPT + languageInstruction(locale), schema: planSchema };
    let tier: Tier | null = "standard";
    while (tier) {
      const result = await generateStructured(via, tier, content, spec);
      if (result.refused) throw new Error(t("errors.replanRefused"));
      if (result.trip && !result.truncated) {
        const checked = checkPlan(planDays, result.trip, droppable);
        return { ...checked, summary: result.trip.summary.trim().slice(0, 600) || null, model: result.model };
      }
      tier = process.env.AI_MODEL ? null : nextTier(tier);
    }
    throw new Error(t("errors.replanIncomplete"));
  },
});

/**
 * Applies a plan from `buildPlan`: stops move to their new day, order and time,
 * and the dropped ones are deleted. The rules are checked again here against the
 * current votes, so a stale or hand-made plan can't drop what the group wants.
 * Stops the plan doesn't mention stay where they are, at the end of their day.
 */
export const applyPlan = mutation({
  args: {
    tripId: v.id("trips"),
    days: v.array(v.object({ subTripId: v.id("subTrips"), items: v.array(v.object({ activityId: v.id("activities"), startTime: v.optional(v.string()) })) })),
    drop: v.array(v.id("activities")),
  },
  handler: async (ctx, { tripId, days, drop }) => {
    const trip = await getOwnedTrip(ctx, tripId);
    const input = await loadPlanInput(ctx, trip);
    const planDays = toPlanDays(input);
    const checked = checkPlan(
      planDays,
      { days: days.map((d) => ({ dayId: d.subTripId, activities: d.items.map((i) => ({ id: i.activityId, startTime: i.startTime })) })), dropped: drop.map((id) => ({ id })) },
      droppableIn(input),
    );

    let moved = 0;
    for (const day of checked.days) {
      for (const [order, item] of day.items.entries()) {
        const a = await ctx.db.get("activities", item.activityId as Id<"activities">);
        if (!a) continue;
        const patch: Partial<Doc<"activities">> = {};
        if (a.order !== order) patch.order = order;
        if (item.startTime && item.startTime !== a.startTime) patch.startTime = item.startTime;
        if (a.subTripId !== day.subTripId) {
          patch.subTripId = day.subTripId as Id<"subTrips">;
          moved++;
          // Steps inside it follow it to the new day.
          const tree = await subtree(ctx, a);
          await Promise.all(tree.slice(1).map((x) => ctx.db.patch("activities", x._id, { subTripId: day.subTripId as Id<"subTrips"> })));
        }
        if (Object.keys(patch).length) await ctx.db.patch("activities", a._id, patch);
      }
    }

    const removed: Id<"activities">[] = [];
    for (const { activityId } of checked.dropped) {
      const a = await ctx.db.get("activities", activityId as Id<"activities">);
      if (!a) continue;
      const tree = await subtree(ctx, a);
      const ids = tree.map((x) => x._id);
      // Photos and journal notes are never thrown away: such a stop stays, at the end of its day.
      const keeps = await Promise.all(
        ids.map(async (id) => (await ctx.db.query("memories").withIndex("by_activityId", (q) => q.eq("activityId", id)).first()) ?? (await ctx.db.query("journalNotes").withIndex("by_activityId_authorId", (q) => q.eq("activityId", id)).first())),
      );
      if (keeps.some(Boolean)) {
        const end = (await ctx.db.query("activities").withIndex("by_subTripId_parentId_order", (q) => q.eq("subTripId", a.subTripId).eq("parentId", undefined)).collect()).length;
        await ctx.db.patch("activities", a._id, { order: end });
        continue;
      }
      for (const id of ids) {
        const photos = await ctx.db.query("memories").withIndex("by_activityId", (q) => q.eq("activityId", id)).collect();
        await Promise.all(photos.map((m) => deleteMemory(ctx, m._id, m.storageId)));
      }
      await deleteNotesFor(ctx, ids);
      await Promise.all(ids.map((id) => ctx.db.delete("activities", id)));
      removed.push(...ids);
    }
    await deleteVotesFor(ctx, tripId, removed);

    const { name } = await getCallerProfile(ctx);
    await notify(ctx, trip, { kind: "groupPlan", actorId: trip.userId, params: { name: name.split(" ")[0] } });
    return { moved, removed: checked.dropped.length };
  },
});
