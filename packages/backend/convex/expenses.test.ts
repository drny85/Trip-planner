/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { balances, settleUp, shares } from "./lib/settle";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("settle math", () => {
  test("uneven splits still add up to the cent", () => {
    expect(shares(1000, ["a", "b", "c"]).map(([, c]) => c)).toEqual([334, 333, 333]);
  });
  test("finds the fewest payments", () => {
    const net = balances([
      { paidBy: "a", amountCents: 9000, splitAmong: ["a", "b", "c"] },
      { paidBy: "b", amountCents: 3000, splitAmong: ["a", "b", "c"] },
    ]);
    expect(Object.fromEntries(net)).toEqual({ a: 5000, b: -1000, c: -4000 });
    expect(settleUp(net)).toEqual([
      { from: "c", to: "a", amountCents: 4000 },
      { from: "b", to: "a", amountCents: 1000 },
    ]);
  });
});

describe("expenses", () => {
  test("members log costs, see who owes whom, and settle up", async () => {
    const t = convexTest(schema, modules);
    const ana = t.withIdentity({ subject: "ana", name: "Ana" });
    const tripId = await ana.mutation(api.seed.demoTrip, {});
    const token = await ana.mutation(api.members.createInvite, { tripId });
    const ben = t.withIdentity({ subject: "ben", name: "Ben" });
    await ben.mutation(api.members.join, { token });
    const stranger = t.withIdentity({ subject: "zed", name: "Zed" });

    await ana.mutation(api.expenses.add, { tripId, description: "Ryokan", amountCents: 30000, paidBy: "ana", splitAmong: ["ana", "ben"] });
    const sushiId = await ben.mutation(api.expenses.add, { tripId, description: "Sushi", amountCents: 6000, paidBy: "ben", splitAmong: ["ana", "ben"] });

    const seen = (await ben.query(api.expenses.forTrip, { tripId }))!;
    expect(seen.totalCents).toBe(36000);
    expect(seen.myBalanceCents).toBe(-12000);
    expect(seen.transfers).toEqual([expect.objectContaining({ from: "ben", to: "ana", amountCents: 12000, fromName: "You", toName: "Ana" })]);

    await expect(ana.mutation(api.expenses.add, { tripId, description: "x", amountCents: 100, paidBy: "zed", splitAmong: ["ana"] })).rejects.toThrow();
    await expect(ana.mutation(api.expenses.add, { tripId, description: "x", amountCents: 0, paidBy: "ana", splitAmong: ["ana"] })).rejects.toThrow();
    expect(await stranger.query(api.expenses.forTrip, { tripId })).toBeNull();

    await ben.mutation(api.expenses.settle, { tripId, from: "ben", to: "ana", amountCents: 12000 });
    const after = (await ana.query(api.expenses.forTrip, { tripId }))!;
    expect(after.transfers).toEqual([]);
    expect(after.totalCents).toBe(36000);

    // Ben can delete his own expense; Ana (organizer) can delete anything.
    await ben.mutation(api.expenses.remove, { expenseId: sushiId });
    expect((await ana.query(api.expenses.forTrip, { tripId }))!.expenses).toHaveLength(2);
  });
});

describe("notifications", () => {
  test("ideas, votes, joins and expenses notify the others, not the actor", async () => {
    const t = convexTest(schema, modules);
    const ana = t.withIdentity({ subject: "ana", name: "Ana" });
    const ben = t.withIdentity({ subject: "ben", name: "Ben Ito" });
    const tripId = await ana.mutation(api.seed.demoTrip, {});
    const token = await ana.mutation(api.members.createInvite, { tripId });
    await ben.mutation(api.members.join, { token });
    const day = (await ana.query(api.trips.get, { tripId }))!.subTrips[0]!;

    expect((await ana.query(api.notifications.feed, {}))!.items.map((n) => n.text)).toEqual(["Ben Ito joined the trip."]);

    const idea = await ben.mutation(api.suggestions.create, {
      subTripId: day._id, title: "Karaoke", description: "", address: "", photoUrl: "https://picsum.photos/seed/k/800/600", category: "nightlife",
    });
    expect((await ana.query(api.notifications.feed, {}))!.items[0]).toMatchObject({ kind: "idea", text: 'Ben suggested "Karaoke". Cast your vote.' });
    await ana.mutation(api.suggestions.vote, { suggestionId: idea, value: "yes" });
    expect((await ben.query(api.notifications.feed, {}))!.items[0]).toMatchObject({ kind: "accepted" });

    await ana.mutation(api.expenses.add, { tripId, description: "Taxi", amountCents: 2500, paidBy: "ana", splitAmong: ["ana", "ben"] });
    const benFeed = (await ben.query(api.notifications.feed, {}))!;
    expect(benFeed.items[0]).toMatchObject({ kind: "expense", text: "Ana added Taxi (¥25), split 2 ways." });
    expect(benFeed.unread).toBe(2);
    await ben.mutation(api.notifications.markAllRead, {});
    expect((await ben.query(api.notifications.feed, {}))!.unread).toBe(0);

    // Each reader gets the text in their own language; the stored params let the apps re-render it.
    await ben.mutation(api.users.setLanguage, { language: "es" });
    await ana.mutation(api.expenses.add, { tripId, description: "Cena", amountCents: 9000, paidBy: "ana", splitAmong: ["ana", "ben"] });
    expect((await ben.query(api.notifications.feed, {}))!.items[0]).toMatchObject({
      kind: "expense",
      text: expect.stringMatching(/^Ana agregó Cena \(.+90\), dividido entre 2\.$/),
      params: expect.objectContaining({ name: "Ana", item: "Cena", count: 2, amountCents: 9000 }),
    });
    await expect(ben.mutation(api.users.setLanguage, { language: "xx" })).rejects.toThrow();

    await ben.mutation(api.notifications.registerPushToken, { token: "ExponentPushToken[abc]" });
    await expect(ben.mutation(api.notifications.registerPushToken, { token: "nope" })).rejects.toThrow();
  });
});
