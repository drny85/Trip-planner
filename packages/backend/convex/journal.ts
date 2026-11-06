import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isLocale, translator, type MessageKey, type Messages } from "@trip/i18n";
import { aiVia, generateViaAnthropic, generateViaGateway, languageInstruction } from "./ai";
import { findMembership, getMemberActivity, getMemberTrip, getOptionalUserId, getOwnedTrip } from "./lib/auth";
import { requireStarted } from "./lib/billing";
import { listMembers } from "./lib/members";
import { languageOf } from "./lib/notify";
import { modelsFor, nextTier, type Tier } from "./lib/modelRouter";
import { STORY_PROMPT, type Story, type StoryInput, storyPrompt, storySchema, templateStory, toStory } from "./lib/story";
import { newToken } from "./lib/tokens";

/**
 * The shared trip journal. Everyone on a trip can leave a short note on an
 * activity they've done (photos are `memories`). Afterwards, anyone on the trip
 * can ask the AI to write the trip's story from the notes and photos; the
 * organizer can publish it at /share/<token>/story, on the trip's share link.
 */

export const MAX_NOTE = 500;
/** A request older than this is treated as stuck, so it can be retried. */
const WRITING_TIMEOUT_MS = 3 * 60_000;

// ---------------------------------------------------------------- notes

/** Every note on the trip, oldest first, with who wrote it. Null for non-members. */
export const notesForTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const [rows, members] = await Promise.all([
      ctx.db.query("journalNotes").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      listMembers(ctx, trip),
    ]);
    const byId = new Map(members.map((m) => [m.userId, m]));
    return rows.map((n) => ({
      _id: n._id,
      _creationTime: n._creationTime,
      activityId: n.activityId,
      text: n.text,
      authorName: byId.get(n.authorId)?.name ?? "A former member",
      authorImageUrl: byId.get(n.authorId)?.imageUrl,
      isMine: n.authorId === userId,
      canDelete: n.authorId === userId || trip.userId === userId,
    }));
  },
});

/**
 * Writes (or rewrites) the caller's note on an activity. New notes need the
 * activity to be done; an empty text deletes the note.
 */
export const saveNote = mutation({
  args: { activityId: v.id("activities"), text: v.string() },
  handler: async (ctx, { activityId, text }) => {
    const { activity, userId } = await getMemberActivity(ctx, activityId);
    const t = translator(await languageOf(ctx, userId));
    const clean = text.trim();
    if (clean.length > MAX_NOTE) throw new Error(t("errors.noteTooLong", { max: MAX_NOTE }));
    const existing = await ctx.db
      .query("journalNotes")
      .withIndex("by_activityId_authorId", (q) => q.eq("activityId", activityId).eq("authorId", userId))
      .unique();
    if (!clean) {
      if (existing) await ctx.db.delete("journalNotes", existing._id);
      return null;
    }
    if (existing) {
      await ctx.db.patch("journalNotes", existing._id, { text: clean });
      return existing._id;
    }
    if (!activity.isCompleted) throw new Error(t("errors.noteNotDone"));
    return ctx.db.insert("journalNotes", { tripId: activity.tripId, activityId, authorId: userId, text: clean });
  },
});

/** The author or the organizer can delete a note. */
export const removeNote = mutation({
  args: { noteId: v.id("journalNotes") },
  handler: async (ctx, { noteId }) => {
    const note = await ctx.db.get("journalNotes", noteId);
    if (!note) return;
    const { trip, userId } = await getMemberTrip(ctx, note.tripId);
    if (note.authorId !== userId && trip.userId !== userId) throw new Error(translator(await languageOf(ctx, userId))("errors.noteDeleteForbidden"));
    await ctx.db.delete("journalNotes", noteId);
  },
});

/** Deletes the notes on these activities. Called when activities are deleted. */
export async function deleteNotesFor(ctx: MutationCtx, activityIds: Id<"activities">[]) {
  for (const activityId of activityIds) {
    const notes = await ctx.db
      .query("journalNotes")
      .withIndex("by_activityId_authorId", (q) => q.eq("activityId", activityId))
      .collect();
    await Promise.all(notes.map((n) => ctx.db.delete("journalNotes", n._id)));
  }
}

/** Whether any activity in the list has a note, so a re-plan keeps it. */
export async function hasNotes(ctx: QueryCtx, activityIds: Id<"activities">[]) {
  for (const activityId of activityIds) {
    const note = await ctx.db
      .query("journalNotes")
      .withIndex("by_activityId_authorId", (q) => q.eq("activityId", activityId))
      .first();
    if (note) return true;
  }
  return false;
}

/** Deletes a trip's notes and story. Called when the trip is deleted. */
export async function deleteJournal(ctx: MutationCtx, tripId: Id<"trips">) {
  const [notes, stories] = await Promise.all([
    ctx.db.query("journalNotes").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
    ctx.db.query("tripStories").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
  ]);
  await Promise.all([...notes.map((n) => ctx.db.delete("journalNotes", n._id)), ...stories.map((s) => ctx.db.delete("tripStories", s._id))]);
}

// ---------------------------------------------------------------- story

const findStory = (ctx: QueryCtx, tripId: Id<"trips">) =>
  ctx.db.query("tripStories").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).unique();

/**
 * A story ready to show: each chapter with its day, the stops on that day's
 * route (completed ones, in order, for the map) and up to six photos.
 */
async function resolveStory(ctx: QueryCtx, trip: Doc<"trips">, story: Doc<"tripStories">) {
  const [subTrips, activities, photos] = await Promise.all([
    ctx.db.query("subTrips").withIndex("by_tripId_order", (q) => q.eq("tripId", trip._id)).collect(),
    ctx.db.query("activities").withIndex("by_tripId", (q) => q.eq("tripId", trip._id)).collect(),
    ctx.db.query("memories").withIndex("by_tripId", (q) => q.eq("tripId", trip._id)).collect(),
  ]);
  const days = new Map(subTrips.map((d) => [d._id, d]));
  const byId = new Map(activities.map((a) => [a._id, a]));
  const chapters = await Promise.all(
    (story.chapters ?? []).flatMap((c) => {
      const day = days.get(c.subTripId);
      if (!day) return [];
      const highlights = c.activityIds.flatMap((id) => (byId.has(id) ? [id] : []));
      const route = activities
        .filter((a) => a.subTripId === day._id && !a.parentId && a.isCompleted)
        .sort((a, b) => a.order - b.order)
        .map((a) => ({ _id: a._id, title: a.title, address: a.address, category: a.category, latitude: a.latitude, longitude: a.longitude }));
      // Photos of the stops the chapter mentions first, then the rest of the day's.
      const rank = (p: Doc<"memories">) => {
        const i = highlights.indexOf(p.activityId);
        return i === -1 ? highlights.length + 1 : i;
      };
      const dayPhotos = photos
        .filter((p) => byId.get(p.activityId)?.subTripId === day._id)
        .sort((a, b) => rank(a) - rank(b) || a._creationTime - b._creationTime)
        .slice(0, 6);
      return [
        (async () => ({
          subTripId: day._id,
          dayNumber: day.dayNumber,
          date: day.date,
          location: day.location,
          heading: c.heading,
          body: c.body,
          highlights: highlights.map((id) => byId.get(id)!.title),
          route,
          photos: (
            await Promise.all(
              dayPhotos.map(async (p) => ({ _id: p._id, caption: p.caption, activityTitle: byId.get(p.activityId)?.title ?? "", url: await ctx.storage.getUrl(p.storageId) })),
            )
          ).filter((p): p is typeof p & { url: string } => p.url !== null),
        }))(),
      ];
    }),
  );
  return { title: story.title ?? trip.title, intro: story.intro ?? "", closing: story.closing ?? "", chapters };
}

export type ResolvedStory = Awaited<ReturnType<typeof resolveStory>>;

/** The journal's story card for people on the trip: its state and what they can do. */
export const story = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    const member = trip && userId ? await findMembership(ctx, trip, userId) : null;
    if (!trip || !member) return null;
    const [row, completed, notes] = await Promise.all([
      findStory(ctx, tripId),
      ctx.db.query("activities").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).filter((q) => q.eq(q.field("isCompleted"), true)).collect(),
      ctx.db.query("journalNotes").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    const isOwner = member.role === "owner";
    const t = translator(await languageOf(ctx, userId!));
    const stuck = row?.status === "writing" && Date.now() - row.requestedAt >= WRITING_TIMEOUT_MS;
    const hasStory = Boolean(row?.title);
    const status = !row ? null : row.status === "writing" && !stuck ? "writing" : hasStory ? "ready" : "failed";
    return {
      status,
      error: stuck ? t("errors.storyTimeout") : status === "writing" ? undefined : row?.error && storyError(t, row.error),
      isPublished: row?.isPublished ?? false,
      model: row?.model,
      story: row && hasStory ? await resolveStory(ctx, trip, row) : null,
      completedCount: completed.length,
      noteCount: notes.length,
      tripEnded: trip.endDate < new Date().toISOString().slice(0, 10),
      canPublish: isOwner,
      /** The trip's share token, for the owner, so the app can build the story link. */
      shareToken: isOwner && row?.isPublished ? trip.shareToken : undefined,
    };
  },
});

/**
 * A failed story stores a message key ("errors.storyRefused") so each reader
 * sees it in their own language. Older rows hold plain English text.
 */
function storyError(t: ReturnType<typeof translator>, error: string) {
  return error.startsWith("errors.") ? t(error as MessageKey<Messages>) : error;
}

/** A published story, for anyone with the trip's share link. */
export const publicStory = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (token.length < 16) return null;
    const trip = await ctx.db
      .query("trips")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", token))
      .unique();
    const row = trip && (await findStory(ctx, trip._id));
    // A rewrite in progress keeps showing the published version.
    if (!trip || !row || !row.title || !row.isPublished) return null;
    const members = await listMembers(ctx, trip);
    return {
      trip: { title: trip.title, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, imageUrl: trip.imageUrl },
      travelers: members.map((m) => m.name.split(" ")[0] ?? m.name),
      story: await resolveStory(ctx, trip, row),
    };
  },
});

/** Asks the AI to write (or rewrite) the trip's story. Any traveler can; it runs in the background. */
export const writeStory = mutation({
  /** `language`: the app language of whoever asked; the story is written in it. */
  args: { tripId: v.id("trips"), language: v.optional(v.string()) },
  handler: async (ctx, { tripId, language }) => {
    const { userId, trip } = await getMemberTrip(ctx, tripId);
    await requireStarted(ctx, trip, userId);
    const t = translator(await languageOf(ctx, userId));
    const done = await ctx.db
      .query("activities")
      .withIndex("by_tripId", (q) => q.eq("tripId", tripId))
      .filter((q) => q.eq(q.field("isCompleted"), true))
      .first();
    if (!done) throw new Error(t("errors.storyNothingYet"));
    const row = await findStory(ctx, tripId);
    const now = Date.now();
    if (row?.status === "writing" && now - row.requestedAt < WRITING_TIMEOUT_MS) throw new Error(t("errors.storyBusy"));
    if (row) await ctx.db.patch("tripStories", row._id, { status: "writing", requestedBy: userId, requestedAt: now, error: undefined });
    else await ctx.db.insert("tripStories", { tripId, status: "writing", requestedBy: userId, requestedAt: now, isPublished: false });
    await ctx.scheduler.runAfter(0, internal.journal.generateStory, { tripId, requestedAt: now, language });
  },
});

/** Publishes the story on the trip's share link (turning the link on if needed), or unpublishes it. */
export const publishStory = mutation({
  args: { tripId: v.id("trips"), published: v.boolean() },
  handler: async (ctx, { tripId, published }) => {
    const trip = await getOwnedTrip(ctx, tripId);
    const row = await findStory(ctx, tripId);
    if (!row?.title) throw new Error(translator(await languageOf(ctx, trip.userId))("errors.storyNotWritten"));
    await ctx.db.patch("tripStories", row._id, { isPublished: published });
    if (!published) return null;
    if (trip.shareToken) return trip.shareToken;
    const shareToken = newToken();
    await ctx.db.patch("trips", tripId, { shareToken });
    return shareToken;
  },
});

/** Everything the model reads: the completed stops per day, with notes and photo captions. */
export const storyInput = internalQuery({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }): Promise<StoryInput | null> => {
    const trip = await ctx.db.get("trips", tripId);
    if (!trip) return null;
    const [subTrips, activities, notes, photos, members] = await Promise.all([
      ctx.db.query("subTrips").withIndex("by_tripId_order", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("activities").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("journalNotes").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("memories").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      listMembers(ctx, trip),
    ]);
    const names = new Map(members.map((m) => [m.userId, m.name.split(" ")[0] ?? m.name]));
    // Itinerary order: a step sits right after its parent.
    const ordered = (parentId?: Id<"activities">): Doc<"activities">[] =>
      activities
        .filter((a) => a.parentId === parentId)
        .sort((a, b) => a.order - b.order)
        .flatMap((a) => [a, ...ordered(a._id)]);
    const all = ordered();
    return {
      title: trip.title,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      travelers: members.map((m) => names.get(m.userId)!),
      days: subTrips.map((d) => ({
        id: d._id,
        dayNumber: d.dayNumber,
        title: d.title,
        date: d.date,
        location: d.location,
        done: all
          .filter((a) => a.subTripId === d._id && a.isCompleted)
          .map((a) => {
            const pics = photos.filter((p) => p.activityId === a._id);
            return {
              id: a._id,
              title: a.title,
              category: a.category,
              address: a.address,
              notes: notes.filter((n) => n.activityId === a._id).map((n) => ({ by: names.get(n.authorId) ?? "A friend", text: n.text })),
              photoCaptions: pics.flatMap((p) => (p.caption ? [p.caption] : [])),
              photoCount: pics.length,
            };
          }),
      })),
    };
  },
});

/** Writes the story with the model (or a plain template when no AI key is set) and saves it. */
export const generateStory = internalAction({
  args: { tripId: v.id("trips"), requestedAt: v.number(), language: v.optional(v.string()) },
  handler: async (ctx, { tripId, requestedAt, language }): Promise<null> => {
    const save = (result: { story: Story; model: string } | { error: string }): Promise<null> =>
      ctx.runMutation(internal.journal.saveStory, { tripId, requestedAt, ...result });
    const input: StoryInput | null = await ctx.runQuery(internal.journal.storyInput, { tripId });
    if (!input) return null;
    const via = aiVia();
    if (!via) {
      const story = templateStory(input);
      return story ? save({ story, model: "template" }) : save({ error: "errors.storyNoDone" });
    }
    try {
      const content = storyPrompt(input);
      const spec = { system: STORY_PROMPT + (isLocale(language) ? languageInstruction(language) : ""), schema: storySchema };
      let tier: Tier | null = "standard";
      while (tier) {
        const models = modelsFor(tier, via);
        const result = via === "gateway" ? await generateViaGateway(models, tier, content, spec) : await generateViaAnthropic(models[0]!, tier, content, spec);
        if (result.refused) return save({ error: "errors.storyRefused" });
        const story: Story | null = result.trip && !result.truncated ? toStory(result.trip, input) : null;
        if (story) return save({ story, model: result.model });
        tier = process.env.AI_MODEL ? null : nextTier(tier);
      }
      return save({ error: "errors.storyIncomplete" });
    } catch (e) {
      console.error("generateStory failed", e);
      return save({ error: "errors.storyFailed" });
    }
  },
});

const storyArg = v.object({
  title: v.string(),
  intro: v.string(),
  closing: v.string(),
  chapters: v.array(v.object({ subTripId: v.id("subTrips"), heading: v.string(), body: v.string(), activityIds: v.array(v.id("activities")) })),
});

export const saveStory = internalMutation({
  args: { tripId: v.id("trips"), requestedAt: v.number(), story: v.optional(storyArg), model: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, { tripId, requestedAt, story, model, error }): Promise<null> => {
    const row = await findStory(ctx, tripId);
    // A newer request owns the row now; this result is stale.
    if (!row || row.requestedAt !== requestedAt) return null;
    if (!story) {
      // A failed rewrite keeps the story that was there (still published if it was).
      await ctx.db.patch("tripStories", row._id, { status: row.title ? "ready" : "failed", error });
      return null;
    }
    await ctx.db.replace("tripStories", row._id, {
      tripId,
      status: "ready",
      requestedBy: row.requestedBy,
      requestedAt,
      ...story,
      model,
      isPublished: row.isPublished,
    });
    return null;
  },
});
