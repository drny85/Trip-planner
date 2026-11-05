/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type StoryInput, templateStory, toStory } from "./lib/story";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  // No AI key in tests: the story comes from the plain template.
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ana = t.withIdentity({ subject: "ana", name: "Ana Ruiz" });
  const ben = t.withIdentity({ subject: "ben", name: "Ben" });
  const tripId = await ana.mutation(api.seed.demoTrip, {});
  const token = await ana.mutation(api.members.createInvite, { tripId });
  await ben.mutation(api.members.join, { token });
  const trip = (await ana.query(api.trips.get, { tripId }))!;
  const [first, second] = trip.subTrips[0]!.activities;
  return { t, ana, ben, tripId, trip, first: first!, second: second! };
}

describe("journal notes", () => {
  test("everyone on the trip leaves one note per done activity", async () => {
    const { t, ana, ben, tripId, first } = await setup();
    await expect(ben.mutation(api.journal.saveNote, { activityId: first._id, text: "Loved it" })).rejects.toThrow(/Mark it done/);
    await ana.mutation(api.activities.setCompleted, { activityId: first._id, isCompleted: true });
    await ben.mutation(api.journal.saveNote, { activityId: first._id, text: "  Loved it " });
    await ben.mutation(api.journal.saveNote, { activityId: first._id, text: "Loved it, go early" });
    await ana.mutation(api.journal.saveNote, { activityId: first._id, text: "Best breakfast" });

    const notes = (await ana.query(api.journal.notesForTrip, { tripId }))!;
    expect(notes).toHaveLength(2);
    expect(notes.find((n) => n.authorName === "Ben")).toMatchObject({ text: "Loved it, go early", isMine: false, canDelete: true });
    expect(await t.withIdentity({ subject: "zed" }).query(api.journal.notesForTrip, { tripId })).toBeNull();

    // Only the author or the organizer can delete; an empty text clears your own.
    const anas = notes.find((n) => n.isMine)!;
    await expect(ben.mutation(api.journal.removeNote, { noteId: anas._id })).rejects.toThrow(/Only the person/);
    await ben.mutation(api.journal.saveNote, { activityId: first._id, text: " " });
    expect(await ana.query(api.journal.notesForTrip, { tripId })).toHaveLength(1);
    await expect(ana.mutation(api.journal.saveNote, { activityId: first._id, text: "x".repeat(501) })).rejects.toThrow(/under 500/);
  });

  test("deleting an activity or the trip deletes its notes and story", async () => {
    const { t, ana, tripId, first } = await setup();
    await ana.mutation(api.activities.setCompleted, { activityId: first._id, isCompleted: true });
    await ana.mutation(api.journal.saveNote, { activityId: first._id, text: "Great" });
    await ana.mutation(api.activities.remove, { activityId: first._id });
    expect(await ana.query(api.journal.notesForTrip, { tripId })).toEqual([]);

    const trip = (await ana.query(api.trips.get, { tripId }))!;
    const next = trip.subTrips[0]!.activities[0]!;
    await ana.mutation(api.activities.setCompleted, { activityId: next._id, isCompleted: true });
    await ana.mutation(api.journal.saveNote, { activityId: next._id, text: "Nice" });
    await ana.mutation(api.journal.writeStory, { tripId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await ana.mutation(api.trips.remove, { tripId });
    expect(await t.run((ctx) => ctx.db.query("journalNotes").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("tripStories").collect())).toEqual([]);
  });
});

describe("trip story", () => {
  test("anyone on the trip writes it; the organizer publishes it on the share link", async () => {
    const { t, ana, ben, tripId, first, second } = await setup();
    await expect(ben.mutation(api.journal.writeStory, { tripId })).rejects.toThrow(/Check off/);

    await ana.mutation(api.activities.setCompleted, { activityId: first._id, isCompleted: true });
    await ana.mutation(api.activities.setCompleted, { activityId: second._id, isCompleted: true });
    await ben.mutation(api.journal.saveNote, { activityId: second._id, text: "The view!" });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"], { type: "image/jpeg" })));
    await ben.mutation(api.memories.add, { activityId: second._id, storageId, caption: "Sunset" });

    await ben.mutation(api.journal.writeStory, { tripId });
    expect((await ana.query(api.journal.story, { tripId }))!.status).toBe("writing");
    await expect(ana.mutation(api.journal.writeStory, { tripId })).rejects.toThrow(/already/);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const card = (await ben.query(api.journal.story, { tripId }))!;
    expect(card).toMatchObject({ status: "ready", model: "template", isPublished: false, canPublish: false, completedCount: 2, noteCount: 1 });
    const chapter = card.story!.chapters[0]!;
    expect(chapter.body).toContain("The view!");
    expect(chapter.highlights).toEqual([first.title, second.title]);
    expect(chapter.route.map((r) => r._id)).toEqual([first._id, second._id]);
    expect(chapter.photos).toMatchObject([{ caption: "Sunset" }]);

    // Members can't publish; the organizer's publish turns the share link on.
    await expect(ben.mutation(api.journal.publishStory, { tripId, published: true })).rejects.toThrow();
    const token = (await ana.mutation(api.journal.publishStory, { tripId, published: true }))!;
    expect((await ana.query(api.journal.story, { tripId }))!.shareToken).toBe(token);
    const pub = (await t.query(api.journal.publicStory, { token }))!;
    expect(pub.travelers).toEqual(["Ana", "Ben"]);
    expect(pub.story.chapters).toHaveLength(1);
    expect(JSON.stringify(pub)).not.toMatch(/"ana"|"ben"|userId/);

    // Unpublishing, or turning the share link off, takes the story down.
    await ana.mutation(api.journal.publishStory, { tripId, published: false });
    expect(await t.query(api.journal.publicStory, { token })).toBeNull();
    await ana.mutation(api.journal.publishStory, { tripId, published: true });
    await ana.mutation(api.trips.unshare, { tripId });
    expect(await t.query(api.journal.publicStory, { token })).toBeNull();
  });
});

describe("story helpers", () => {
  const day1 = "d1" as Id<"subTrips">;
  const day2 = "d2" as Id<"subTrips">;
  const input: StoryInput = {
    title: "Tokyo Adventure",
    destination: "Tokyo",
    startDate: "2026-04-01",
    endDate: "2026-04-02",
    travelers: ["Ana", "Ben"],
    days: [
      { id: day1, dayNumber: 1, title: "Day 1", done: [{ id: "a1" as Id<"activities">, title: "Senso-ji", address: "", notes: [{ by: "Ben", text: "Wow" }], photoCaptions: [], photoCount: 0 }] },
      { id: day2, dayNumber: 2, title: "Day 2", location: "Kyoto", done: [{ id: "a2" as Id<"activities">, title: "Fushimi Inari", address: "", notes: [], photoCaptions: [], photoCount: 0 }] },
    ],
  };

  test("toStory keeps only real days and stops, in trip order", () => {
    const story = toStory(
      {
        title: "Two days",
        intro: "Hi",
        closing: "Bye",
        chapters: [
          { dayId: "d2", heading: "Gates", body: "Red gates", stopIds: ["a2", "a1", "zz"] },
          { dayId: "nope", heading: "x", body: "y", stopIds: [] },
          { dayId: "d1", heading: "Temple", body: "Incense", stopIds: ["a1", "a1"] },
          { dayId: "d1", heading: "Again", body: "dup", stopIds: [] },
        ],
      },
      input,
    )!;
    expect(story.chapters.map((c) => [c.subTripId, c.activityIds])).toEqual([
      [day1, ["a1"]],
      [day2, ["a2"]],
    ]);
    expect(toStory({ title: "", intro: "", closing: "", chapters: [] }, input)).toBeNull();
  });

  test("templateStory quotes the notes", () => {
    const story = templateStory(input)!;
    expect(story.title).toBe("Our Tokyo story");
    expect(story.intro).toContain("Ana and Ben");
    expect(story.chapters[0]!.body).toContain('"Wow" (Ben, at Senso-ji)');
    expect(story.chapters[1]!.heading).toBe("Day 2 in Kyoto");
  });
});
