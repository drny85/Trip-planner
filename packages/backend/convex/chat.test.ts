/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { badgeLabel, chatRows, cleanMessage, dayLabel, localDate, localTime, MAX_MESSAGE_LENGTH, pushBody, PUSH_QUIET_MS, shouldPush } from "./lib/chat";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** Ana's trip, with Ben and Cy who joined by invite. Ben has a phone registered for push. */
async function crew() {
  const t = convexTest(schema, modules);
  const ana = t.withIdentity({ subject: "ana", name: "Ana Lima" });
  const tripId = await ana.mutation(api.seed.demoTrip, {});
  const token = await ana.mutation(api.members.createInvite, { tripId });
  const ben = t.withIdentity({ subject: "ben", name: "Ben" });
  const cy = t.withIdentity({ subject: "cy", name: "Cy" });
  await ben.mutation(api.members.join, { token });
  await cy.mutation(api.members.join, { token });
  await ben.mutation(api.notifications.registerPushToken, { token: "ExponentPushToken[ben]" });
  const trip = (await ana.query(api.trips.get, { tripId }))!;
  return { t, ana, ben, cy, tripId, trip };
}

/** Chat pushes waiting to be sent, oldest first. */
async function chatPushes(t: ReturnType<typeof convexTest>) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs
    .map((j) => j.args[0] as { tokens: string[]; title: string; body: string; data: { screen?: string; tripId: string } })
    .filter((a) => a?.data?.screen === "chat");
}

describe("chat rules", () => {
  test("cleans messages", () => {
    expect(cleanMessage("  hi  ")).toBe("hi");
    expect(cleanMessage("a\r\n\r\n\r\n\r\nb")).toBe("a\n\nb");
    expect(cleanMessage(" \n\t ")).toBe("");
  });

  test("a busy chat buzzes once until it's read", () => {
    const now = 1_000_000;
    expect(shouldPush({ lastReadAt: 0, now })).toBe(true);
    expect(shouldPush({ muted: true, lastReadAt: 0, now })).toBe(false);
    // Pushed a minute ago and not read since: stay quiet.
    expect(shouldPush({ lastReadAt: 0, lastPushAt: now - 60_000, now })).toBe(false);
    // Read after that push: the next message is news.
    expect(shouldPush({ lastReadAt: now - 30_000, lastPushAt: now - 60_000, now })).toBe(true);
    // Not read, but it's been a while.
    expect(shouldPush({ lastReadAt: 0, lastPushAt: now - PUSH_QUIET_MS, now })).toBe(true);
  });

  test("push text and badges", () => {
    expect(pushBody("Ana Lima", "see you\n at 8!")).toBe("Ana: see you at 8!");
    const long = pushBody("Ben", "x".repeat(500));
    expect(long.length).toBe(140);
    expect(long.endsWith("…")).toBe(true);
    expect(badgeLabel(7)).toBe("7");
    expect(badgeLabel(120)).toBe("99+");
  });
});

describe("chat", () => {
  test("members talk, strangers and share-link viewers can't see it", async () => {
    const { t, ana, ben, tripId } = await crew();
    await ana.mutation(api.chat.send, { tripId, text: "  Who's up for ramen tonight?  " });
    await ben.mutation(api.chat.send, { tripId, text: "Me!" });

    const asBen = (await ben.query(api.chat.list, { tripId }))!;
    expect(asBen.messages.map((m) => [m.authorName, m.text, m.isMine])).toEqual([
      ["Ana Lima", "Who's up for ramen tonight?", false],
      ["Ben", "Me!", true],
    ]);
    expect(asBen.memberCount).toBe(3);

    const zed = t.withIdentity({ subject: "zed", name: "Zed" });
    expect(await zed.query(api.chat.list, { tripId })).toBeNull();
    expect(await zed.query(api.chat.unread, { tripId })).toBe(0);
    await expect(zed.mutation(api.chat.send, { tripId, text: "hi" })).rejects.toThrow(/not found/);
    // Signed out (a share-link viewer) sees nothing either.
    expect(await t.query(api.chat.list, { tripId })).toBeNull();

    await expect(ana.mutation(api.chat.send, { tripId, text: "   " })).rejects.toThrow(/Write a message/);
    await expect(ana.mutation(api.chat.send, { tripId, text: "x".repeat(MAX_MESSAGE_LENGTH + 1) })).rejects.toThrow();
  });

  test("unread counts and badges per trip", async () => {
    const { ana, ben, cy, tripId } = await crew();
    await ana.mutation(api.chat.send, { tripId, text: "One" });
    await ana.mutation(api.chat.send, { tripId, text: "Two" });
    expect(await ben.query(api.chat.unread, { tripId })).toBe(2);
    expect(await ben.query(api.chat.unreadByTrip, {})).toEqual({ [tripId]: 2 });
    // Your own messages never count.
    expect(await ana.query(api.chat.unread, { tripId })).toBe(0);
    expect(await ana.query(api.chat.unreadByTrip, {})).toEqual({});

    await ben.mutation(api.chat.markRead, { tripId });
    expect(await ben.query(api.chat.unread, { tripId })).toBe(0);
    expect(await ben.query(api.chat.unreadByTrip, {})).toEqual({});
    // Replying also marks everything before it read.
    await cy.mutation(api.chat.send, { tripId, text: "Three" });
    expect(await cy.query(api.chat.unread, { tripId })).toBe(0);
    expect(await ben.query(api.chat.unread, { tripId })).toBe(1);
  });

  test("messages link to a stop or an idea on the same trip", async () => {
    const { t, ana, ben, tripId, trip } = await crew();
    const stop = trip.subTrips[1]!.activities[0]!;
    const ideaId = await ben.mutation(api.suggestions.create, {
      subTripId: trip.subTrips[0]!._id,
      title: "Karaoke in Shinjuku",
      description: "",
      address: "Shinjuku",
      photoUrl: "https://picsum.photos/seed/k/800/600",
    });
    await ana.mutation(api.chat.send, { tripId, text: "Book this early?", activityId: stop._id });
    await ben.mutation(api.chat.send, { tripId, text: "Vote please", suggestionId: ideaId });

    const { messages } = (await ana.query(api.chat.list, { tripId }))!;
    expect(messages[0]!.link).toMatchObject({ kind: "activity", id: stop._id, title: stop.title, dayNumber: 2, isCompleted: false });
    expect(messages[1]!.link).toMatchObject({ kind: "suggestion", id: ideaId, title: "Karaoke in Shinjuku", status: "open" });

    // A stop from someone else's trip can't be linked.
    const other = t.withIdentity({ subject: "zed", name: "Zed" });
    const otherTripId = await other.mutation(api.seed.demoTrip, {});
    const otherStop = (await other.query(api.trips.get, { tripId: otherTripId }))!.subTrips[0]!.activities[0]!;
    await expect(ana.mutation(api.chat.send, { tripId, text: "x", activityId: otherStop._id })).rejects.toThrow(/isn't on this trip/);
    await expect(ana.mutation(api.chat.send, { tripId, text: "x", activityId: stop._id, suggestionId: ideaId })).rejects.toThrow();

    // If the stop is removed later, the message says so instead of breaking.
    await ana.mutation(api.activities.remove, { activityId: stop._id });
    const after = (await ben.query(api.chat.list, { tripId }))!;
    expect(after.messages[0]!.link).toEqual({ kind: "activity", missing: true });
  });

  test("pushes the others once, then waits until they read", async () => {
    const { t, ana, ben, tripId, trip } = await crew();
    await ana.mutation(api.chat.send, { tripId, text: "Dinner at 8?" });
    let pushes = await chatPushes(t);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ tokens: ["ExponentPushToken[ben]"], title: trip.title, body: "Ana: Dinner at 8?", data: { tripId, screen: "chat" } });

    // A second line right after stays quiet; Ben hasn't looked yet.
    await ana.mutation(api.chat.send, { tripId, text: "Or 8:30" });
    expect(await chatPushes(t)).toHaveLength(1);

    // Once Ben reads, the next message buzzes again.
    await ben.mutation(api.chat.markRead, { tripId });
    await ana.mutation(api.chat.send, { tripId, text: "Booked!" });
    pushes = await chatPushes(t);
    expect(pushes).toHaveLength(2);

    // Muted: nothing.
    await ben.mutation(api.chat.markRead, { tripId });
    await ben.mutation(api.chat.setMuted, { tripId, muted: true });
    expect((await ben.query(api.chat.list, { tripId }))!.muted).toBe(true);
    await ana.mutation(api.chat.send, { tripId, text: "See you there" });
    expect(await chatPushes(t)).toHaveLength(2);

    // Ben's own messages never push to Ben.
    await ben.mutation(api.chat.setMuted, { tripId, muted: false });
    await ben.mutation(api.chat.send, { tripId, text: "👍" });
    expect(await chatPushes(t)).toHaveLength(2);
  });

  test("chat isn't behind the billing gate", async () => {
    // A member on the free plan can always chat, even on a trip they haven't started.
    const { ben, tripId } = await crew();
    await expect(ben.mutation(api.chat.send, { tripId, text: "Free to talk" })).resolves.toBeTruthy();
  });

  test("delete, leave and trip removal", async () => {
    const { t, ana, ben, cy, tripId } = await crew();
    const mine = await ben.mutation(api.chat.send, { tripId, text: "oops" });
    const cys = await cy.mutation(api.chat.send, { tripId, text: "spam" });
    await expect(ben.mutation(api.chat.remove, { messageId: cys })).rejects.toThrow(/your own/);
    await ben.mutation(api.chat.remove, { messageId: mine });
    // The organizer can tidy up anything.
    await ana.mutation(api.chat.remove, { messageId: cys });
    const { messages } = (await ana.query(api.chat.list, { tripId }))!;
    expect(messages.map((m) => [m.deleted, m.text])).toEqual([
      [true, ""],
      [true, ""],
    ]);
    expect(await ana.query(api.chat.unread, { tripId })).toBe(0);

    // Someone who leaves keeps their name on old messages but loses access.
    await cy.mutation(api.chat.send, { tripId, text: "Bye all" });
    await cy.mutation(api.members.leave, { tripId });
    const after = (await ana.query(api.chat.list, { tripId }))!;
    expect(after.messages.at(-1)).toMatchObject({ authorName: "Cy", authorIsMember: false, text: "Bye all" });
    expect(await cy.query(api.chat.list, { tripId })).toBeNull();

    await ana.mutation(api.trips.remove, { tripId });
    const left = await t.run(async (ctx) => [...(await ctx.db.query("chatMessages").collect()), ...(await ctx.db.query("chatReads").collect())]);
    expect(left).toHaveLength(0);
  });

  test("loads the latest page first, with earlier ones on request", async () => {
    const { ana, ben, tripId } = await crew();
    for (let i = 1; i <= 5; i++) await ana.mutation(api.chat.send, { tripId, text: `m${i}` });
    const page = (await ben.query(api.chat.list, { tripId, limit: 3 }))!;
    expect(page.messages.map((m) => m.text)).toEqual(["m3", "m4", "m5"]);
    expect(page.hasMore).toBe(true);
    const all = (await ben.query(api.chat.list, { tripId, limit: 10 }))!;
    expect(all.hasMore).toBe(false);
    expect(all.readUpTo).toBe(0);
  });
});

describe("chat layout", () => {
  const at = (h: number, m: number, day = 6) => new Date(2026, 10, day, h, m).getTime();
  const msg = (id: string, authorId: string, time: number) => ({ _id: id, _creationTime: time, authorId, isMine: authorId === "me" });

  test("groups runs, splits days, and marks where new messages start", () => {
    const messages = [
      msg("a", "ana", at(9, 0, 5)),
      msg("b", "ana", at(9, 1, 5)),
      msg("c", "me", at(9, 2, 5)),
      msg("d", "ana", at(8, 0)),
      msg("e", "ana", at(8, 1)),
      msg("f", "ana", at(8, 30)),
    ];
    const rows = chatRows(messages, at(8, 0) + 1);
    expect(rows.map((r) => (r.kind === "message" ? `${r.message._id}${r.first ? "^" : ""}${r.last ? "$" : ""}` : r.kind))).toEqual([
      "day",
      "a^",
      "b$",
      "c^$",
      "day",
      "d^$",
      "new",
      "e^$",
      "f^$",
    ]);
  });

  test("no divider when nothing was read yet or it's all mine", () => {
    expect(chatRows([msg("a", "ana", at(9, 0))], 0).some((r) => r.kind === "new")).toBe(false);
    expect(chatRows([msg("a", "me", at(9, 0))], at(8, 0)).some((r) => r.kind === "new")).toBe(false);
  });

  test("day labels and local times", () => {
    const now = at(12, 0);
    expect(dayLabel(localDate(at(1, 0)), now)).toBe("today");
    expect(dayLabel(localDate(at(23, 0, 5)), now)).toBe("yesterday");
    expect(dayLabel("2026-10-01", now)).toBe("2026-10-01");
    expect(localTime(at(7, 5))).toBe("07:05");
  });
});
