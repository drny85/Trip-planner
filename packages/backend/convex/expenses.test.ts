/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { balances, checkSplit, ledger, maxPayment, parseAmount, proportional, settleUp, shares } from "./lib/settle";
import { fetchRate } from "./lib/fx";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const eq = (...people: string[]) => ({ mode: "equal" as const, people });

describe("split math", () => {
  test("uneven equal splits still add up to the cent", () => {
    expect(shares(1000, eq("a", "b", "c")).map(([, c]) => c)).toEqual([334, 333, 333]);
  });
  test("shares, percentages and exact amounts", () => {
    // A couple (2 shares) and a single (1 share) splitting a 9,000 room.
    expect(shares(9000, { mode: "shares", people: ["a", "b"], values: [2, 1] })).toEqual([["a", 6000], ["b", 3000]]);
    // 33.34% / 33.33% / 33.33% of 100.00; leftover cents go to the largest remainder.
    expect(shares(10000, { mode: "percent", people: ["a", "b", "c"], values: [3334, 3333, 3333] }).map(([, c]) => c)).toEqual([3334, 3333, 3333]);
    expect(shares(1001, { mode: "percent", people: ["a", "b"], values: [5000, 5000] }).map(([, c]) => c)).toEqual([501, 500]);
    expect(shares(2500, { mode: "exact", people: ["a", "b"], values: [2000, 500] })).toEqual([["a", 2000], ["b", 500]]);
  });
  test("proportional always sums to the total", () => {
    for (const [amount, weights] of [[1, [1, 1, 1]], [999, [3, 7, 11]], [100, [1, 0, 2]], [12345, [1, 1, 1, 1, 1, 1, 1]]] as const) {
      expect(proportional(amount, [...weights]).reduce((a, b) => a + b, 0)).toBe(amount);
    }
  });
  test("checkSplit explains what's wrong", () => {
    expect(checkSplit(100, eq())).toBe("noPeople");
    expect(checkSplit(100, eq("a", "a"))).toBe("duplicatePeople");
    expect(checkSplit(100, { mode: "exact", people: ["a", "b"], values: [50] })).toBe("missingValues");
    expect(checkSplit(100, { mode: "exact", people: ["a", "b"], values: [50, 40] })).toBe("exactMismatch");
    expect(checkSplit(100, { mode: "percent", people: ["a", "b"], values: [5000, 4000] })).toBe("percentMismatch");
    expect(checkSplit(100, { mode: "shares", people: ["a", "b"], values: [0, 0] })).toBe("noShares");
    expect(checkSplit(100, { mode: "shares", people: ["a"], values: [-1] })).toBe("badValue");
    expect(checkSplit(100, { mode: "shares", people: ["a", "b"], values: [1, 0] })).toBeNull();
  });
  test("balances, payments and the fewest transfers", () => {
    const expenses = [
      { paidBy: "a", amountCents: 9000, split: eq("a", "b", "c") },
      { paidBy: "b", amountCents: 3000, split: eq("a", "b", "c") },
    ];
    const net = balances(expenses);
    expect(Object.fromEntries(net)).toEqual({ a: 5000, b: -1000, c: -4000 });
    expect(settleUp(net)).toEqual([
      { from: "c", to: "a", amountCents: 4000 },
      { from: "b", to: "a", amountCents: 1000 },
    ]);
    const after = ledger(expenses, [{ from: "c", to: "a", amountCents: 1500 }]);
    expect(after.get("c")).toEqual({ paidCents: 0, shareCents: 4000, sentCents: 1500, receivedCents: 0, netCents: -2500 });
    expect(after.get("a")!.netCents).toBe(3500);
    expect(maxPayment(balances(expenses), "c", "a")).toBe(4000);
    expect(maxPayment(balances(expenses), "a", "c")).toBe(0);
  });
  test("reads typed amounts in either number style", () => {
    expect(parseAmount("12")).toBe(1200);
    expect(parseAmount("12.5")).toBe(1250);
    expect(parseAmount("12,50")).toBe(1250);
    expect(parseAmount("1,234.56")).toBe(123456);
    expect(parseAmount("1.234,56")).toBe(123456);
    expect(parseAmount("1,234")).toBe(123400);
    expect(parseAmount("1.234")).toBe(123400);
    expect(parseAmount("$ 8.99")).toBe(899);
    expect(parseAmount("1.2.3,4.5")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-3")).toBeNull();
    expect(parseAmount("0.1255")).toBeNull();
  });
});

const codeOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof ConvexError ? (e.data as { code: string }).code : String(e)));

describe("expenses", () => {
  test("members log costs, see who owes whom, and settle up", async () => {
    const t = convexTest(schema, modules);
    const ana = t.withIdentity({ subject: "ana", name: "Ana" });
    const tripId = await ana.mutation(api.seed.demoTrip, {});
    const token = await ana.mutation(api.members.createInvite, { tripId });
    const ben = t.withIdentity({ subject: "ben", name: "Ben" });
    await ben.mutation(api.members.join, { token });
    const stranger = t.withIdentity({ subject: "zed", name: "Zed" });

    await ana.mutation(api.expenses.add, { tripId, description: "Ryokan", amountCents: 30000, paidBy: "ana", split: eq("ana", "ben") });
    const sushiId = await ben.mutation(api.expenses.add, { tripId, description: "Sushi", amountCents: 6000, paidBy: "ben", split: eq("ana", "ben") });

    const seen = (await ben.query(api.expenses.forTrip, { tripId }))!;
    expect(seen.totalCents).toBe(36000);
    expect(seen.myBalanceCents).toBe(-12000);
    expect(seen.transfers).toEqual([{ from: "ben", to: "ana", amountCents: 12000, canRecord: true }]);
    expect(seen.people.find((p) => p.userId === "ben")).toMatchObject({ isMe: true, paidCents: 6000, shareCents: 18000, netCents: -12000 });
    expect(seen.entries[0]).toMatchObject({ kind: "expense", description: "Sushi", myShareCents: 3000, canEdit: true });

    expect(await codeOf(ana.mutation(api.expenses.add, { tripId, description: "x", amountCents: 100, paidBy: "zed", split: eq("ana") }))).toBe("notOnTrip");
    expect(await codeOf(ana.mutation(api.expenses.add, { tripId, description: "x", amountCents: 0, paidBy: "ana", split: eq("ana") }))).toBe("badAmount");
    expect(await codeOf(ana.mutation(api.expenses.add, { tripId, description: "x", amountCents: 100, paidBy: "ana", split: { mode: "exact", people: ["ana", "ben"], values: [10, 20] } }))).toBe("exactMismatch");
    expect(await stranger.query(api.expenses.forTrip, { tripId })).toBeNull();

    // Partial payment, then over-paying is refused, then the rest.
    expect(await codeOf(ben.mutation(api.expenses.recordPayment, { tripId, from: "ben", to: "ana", amountCents: 12001 }))).toBe("tooMuch");
    expect(await codeOf(ben.mutation(api.expenses.recordPayment, { tripId, from: "ana", to: "ben", amountCents: 100 }))).toBe("nothingOwed");
    const partial = await ben.mutation(api.expenses.recordPayment, { tripId, from: "ben", to: "ana", amountCents: 2000 });
    expect((await ana.query(api.expenses.forTrip, { tripId }))!.transfers).toEqual([expect.objectContaining({ amountCents: 10000 })]);
    await ana.mutation(api.expenses.removePayment, { paymentId: partial });
    await ben.mutation(api.expenses.recordPayment, { tripId, from: "ben", to: "ana", amountCents: 12000 });
    const after = (await ana.query(api.expenses.forTrip, { tripId }))!;
    expect(after.transfers).toEqual([]);
    expect(after.totalCents).toBe(36000);
    expect(after.entries[0]).toMatchObject({ kind: "payment", from: "ben", to: "ana", amountCents: 12000 });

    // Re-split the sushi: Ben had most of it, so Ana is now owed 10 back.
    await ben.mutation(api.expenses.update, { expenseId: sushiId, description: "Sushi", amountCents: 6000, paidBy: "ben", split: { mode: "shares", people: ["ana", "ben"], values: [1, 2] } });
    expect((await ana.query(api.expenses.forTrip, { tripId }))!.myBalanceCents).toBe(1000);
    expect(await codeOf(stranger.mutation(api.expenses.update, { expenseId: sushiId, description: "x", amountCents: 1, paidBy: "ben", split: eq("ben") }))).not.toBeNull();

    // Ben can delete his own expense; Ana (organizer) can delete anything.
    await ben.mutation(api.expenses.remove, { expenseId: sushiId });
    expect((await ana.query(api.expenses.forTrip, { tripId }))!.entries.filter((e) => e.kind === "expense")).toHaveLength(1);
  });

  test("old payments stored as expenses still count, and migrate cleanly", async () => {
    const t = convexTest(schema, modules);
    const ana = t.withIdentity({ subject: "ana", name: "Ana" });
    const tripId = await ana.mutation(api.seed.demoTrip, {});
    const token = await ana.mutation(api.members.createInvite, { tripId });
    await t.withIdentity({ subject: "ben", name: "Ben" }).mutation(api.members.join, { token });
    await t.run(async (ctx) => {
      await ctx.db.insert("expenses", { tripId, description: "Taxi", amountCents: 4000, paidBy: "ana", splitAmong: ["ana", "ben"], createdBy: "ana" });
      await ctx.db.insert("expenses", { tripId, description: "Settled up", amountCents: 1500, paidBy: "ben", splitAmong: ["ana"], createdBy: "ben", isSettlement: true });
    });
    const before = (await ana.query(api.expenses.forTrip, { tripId }))!;
    expect(before.myBalanceCents).toBe(500);
    expect(before.totalCents).toBe(4000);
    expect(await t.mutation(internal.expenses.migrateLegacySettlements, {})).toEqual({ moved: 1 });
    const after = (await ana.query(api.expenses.forTrip, { tripId }))!;
    expect(after.myBalanceCents).toBe(500);
    expect(after.entries.map((e) => e.kind).sort()).toEqual(["expense", "payment"]);
  });
});

describe("currencies", () => {
  test("expenses in another currency convert into the group's at the rate given", async () => {
    const t = convexTest(schema, modules);
    const ana = t.withIdentity({ subject: "ana", name: "Ana" });
    const tripId = await ana.mutation(api.seed.demoTrip, {}); // a Tokyo trip, local currency JPY
    await ana.mutation(api.users.setHomeCurrency, { currency: "USD", onlyIfUnset: true });
    await ana.mutation(api.users.setHomeCurrency, { currency: "EUR", onlyIfUnset: true }); // ignored: already set
    const token = await ana.mutation(api.members.createInvite, { tripId });
    const ben = t.withIdentity({ subject: "ben", name: "Ben" });
    await ben.mutation(api.members.join, { token });

    const before = (await ben.query(api.expenses.forTrip, { tripId }))!;
    expect(before).toMatchObject({ currency: "USD", localCurrency: "JPY", homeCurrency: null, canChangeCurrency: false });

    // ¥10,000 dinner at 1 JPY = 0.0065 USD, and a $40 taxi.
    expect(await codeOf(ana.mutation(api.expenses.add, { tripId, description: "Dinner", amountCents: 1_000_000, currency: "JPY", paidBy: "ana", split: eq("ana", "ben") }))).toBe("needRate");
    await ana.mutation(api.expenses.add, { tripId, description: "Dinner", amountCents: 1_000_000, currency: "JPY", rate: 0.0065, paidBy: "ana", split: { mode: "exact", people: ["ana", "ben"], values: [600_000, 400_000] } });
    await ben.mutation(api.expenses.add, { tripId, description: "Taxi", amountCents: 4000, paidBy: "ben", split: eq("ana", "ben") });

    const seen = (await ana.query(api.expenses.forTrip, { tripId }))!;
    expect(seen.totalCents).toBe(6500 + 4000);
    const dinner = seen.entries.find((e) => e.kind === "expense" && e.description === "Dinner")!;
    expect(dinner).toMatchObject({ currency: "JPY", amountCents: 1_000_000, groupCents: 6500, shares: [{ userId: "ana", cents: 3900, value: 600_000 }, { userId: "ben", cents: 2600, value: 400_000 }] });
    expect(seen.myBalanceCents).toBe(2600 - 2000);

    // The organizer switches balances to euros at 1 USD = 0.9 EUR.
    await expect(ben.mutation(api.expenses.setGroupCurrency, { tripId, currency: "EUR", rate: 0.9 })).rejects.toThrow();
    await ana.mutation(api.expenses.setGroupCurrency, { tripId, currency: "EUR", rate: 0.9 });
    const eur = (await ana.query(api.expenses.forTrip, { tripId }))!;
    expect(eur.currency).toBe("EUR");
    expect(eur.totalCents).toBe(Math.round(1_000_000 * 0.0065 * 0.9) + 3600);
    expect(eur.myBalanceCents).toBe(Math.round(1_000_000 * 0.0065 * 0.9 * 0.4) - 1800);
  });

  test("today's rate comes from the first source that has it", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url.includes("frankfurter")) return new Response("{}", { status: 404 });
      return Response.json({ result: "success", time_last_update_utc: "Thu, 05 Nov 2026 00:00:01 +0000", rates: { DOP: 63.1 } });
    }) as typeof fetch;
    expect(await fetchRate("USD", "DOP", fake)).toEqual({ rate: 63.1, source: "open.er-api.com", date: "2026-11-05" });
    expect(calls).toHaveLength(2);
    expect(await fetchRate("USD", "USD", fake)).toMatchObject({ rate: 1 });
    expect(await fetchRate("usd", "EUR", fake)).toBeNull();
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

    await ana.mutation(api.expenses.add, { tripId, description: "Taxi", amountCents: 2500, paidBy: "ana", split: eq("ana", "ben") });
    const benFeed = (await ben.query(api.notifications.feed, {}))!;
    expect(benFeed.items[0]).toMatchObject({ kind: "expense", text: "Ana added Taxi (¥25), split 2 ways." });
    expect(benFeed.unread).toBe(2);
    await ben.mutation(api.notifications.markAllRead, {});
    expect((await ben.query(api.notifications.feed, {}))!.unread).toBe(0);

    // Each reader gets the text in their own language; the stored params let the apps re-render it.
    await ben.mutation(api.users.setLanguage, { language: "es" });
    await ana.mutation(api.expenses.add, { tripId, description: "Cena", amountCents: 9000, paidBy: "ana", split: eq("ana", "ben") });
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
