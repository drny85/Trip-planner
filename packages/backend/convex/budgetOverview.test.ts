/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CATEGORY_FOR } from "./lib/bookings";
import { BOOKING_CATEGORY, budgetOverview, currenciesIn, dayFor, guessCategory, type OverviewExtras, type OverviewTrip } from "./lib/budgetOverview";
import type { ActivityNode } from "./lib/tree";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

let n = 0;
const node = (over: Partial<ActivityNode>, children: ActivityNode[] = []): ActivityNode =>
  ({ _id: `a${++n}`, title: "x", category: "other", isCompleted: false, order: 0, children, ...over }) as ActivityNode;

const hotel = node({ _id: "hotel" as ActivityNode["_id"], category: "lodging", estimatedCost: 20000 });
const ramen = node({ category: "food", estimatedCost: 1500, isCompleted: true });
const museum = node({ category: "sightseeing", estimatedCost: 2000, actualCost: 2400 });
const trip: OverviewTrip = {
  startDate: "2027-04-02",
  endDate: "2027-04-03",
  currency: "JPY",
  subTrips: [
    { _id: "d1", title: "Shinjuku", dayNumber: 1, activities: [hotel, ramen] },
    { _id: "d2", title: "Asakusa", dayNumber: 2, activities: [museum] },
  ],
};
const none: OverviewExtras = { travelers: 2, expenses: [], bookings: [], fares: [] };

describe("budgetOverview", () => {
  test("itinerary only: per person, or times everyone for the group", () => {
    const me = budgetOverview({ trip, extras: none, scope: "me", display: "JPY", rates: {} });
    // Ramen is done with no actual cost, so its estimate counts as spent.
    expect(me.total).toEqual({ planned: 23500, spent: 3900 });
    expect(me.byDay.map((d) => [d.key, d.dayNumber, d.planned, d.spent])).toEqual([
      ["d1", 1, 21500, 1500],
      ["d2", 2, 2000, 2400],
    ]);
    expect(me.byCategory.map((c) => c.category)).toEqual(["lodging", "sightseeing", "food"]);
    expect(me.bySource).toEqual([{ source: "itinerary", planned: 23500, spent: 3900 }]);

    const group = budgetOverview({ trip, extras: none, scope: "group", display: "JPY", rates: {} });
    expect(group.total).toEqual({ planned: 47000, spent: 7800 });
  });

  test("bookings, shared costs and flight fares, converted into the display currency", () => {
    const extras: OverviewExtras = {
      travelers: 2,
      // The hotel booking replaces the hotel activity's estimate.
      bookings: [{ _id: "b1", kind: "hotel", title: "Park Hyatt", activityId: "hotel", date: "2027-04-02", cents: 5_000_000, currency: "JPY", people: 2 }],
      expenses: [
        { _id: "e1", description: "Taxi", category: "transport", date: "2027-04-03", currency: "USD", totalCents: 4000, myShareCents: 2000 },
        { _id: "e2", description: "Rail pass", category: "transport", date: "2027-03-20", currency: "USD", totalCents: 50000, myShareCents: 25000 },
      ],
      fares: [
        { _id: "f1", isMine: true, date: "2027-04-02", cents: 120000, currency: "USD", people: 1 },
        { _id: "f2", isMine: false, date: "2027-04-02", cents: 90000, currency: "USD", people: 1 },
      ],
    };
    const rates = { USD: 150 };
    const me = budgetOverview({ trip, extras, scope: "me", display: "JPY", rates });
    // Planned: booking 25,000 (half of 50,000) + ramen 1,500 + museum 2,000 + my fare $1,200.
    expect(me.total.planned).toBe(25000 + 1500 + 2000 + 1200 * 150);
    // Spent: booking 25,000 + museum 2,400 + my shares $20 + $250. Ramen's estimate no longer counts:
    // the group logs real spending now.
    expect(me.total.spent).toBe(25000 + 2400 + 270 * 150);
    expect(me.byDay.map((d) => d.key)).toEqual(["before", "d1", "d2"]);
    expect(me.byDay[0]).toMatchObject({ planned: 0, spent: 250 * 150 });
    expect(me.bySource.map((s) => s.source)).toEqual(["itinerary", "bookings", "shared", "flights"]);
    expect(me.byCategory[0]!.category).toBe("transport");
    expect(me.missingRates).toEqual([]);

    const group = budgetOverview({ trip, extras, scope: "group", display: "JPY", rates });
    expect(group.bySource.find((s) => s.source === "flights")!.planned).toBe(2100 * 150);
    expect(group.bySource.find((s) => s.source === "bookings")!.spent).toBe(50000);

    // Shown in dollars, with no yen rate: only the dollar amounts count, and it says so.
    const usd = budgetOverview({ trip, extras, scope: "group", display: "USD", rates: {} });
    expect(usd.missingRates).toEqual(["JPY"]);
    expect(usd.total).toEqual({ planned: 2100, spent: 540 });
    expect(currenciesIn(trip, extras, "USD")).toEqual(["JPY"]);
    expect(currenciesIn(trip, extras, "JPY")).toEqual(["USD"]);
  });

  test("days: before, during (legs span days) and after the trip", () => {
    const legs: OverviewTrip = { ...trip, endDate: "2027-04-06", subTrips: [{ _id: "d1", title: "Tokyo", dayNumber: 1, date: "2027-04-02", activities: [] }, { _id: "kyoto", title: "Kyoto leg", dayNumber: 3, date: "2027-04-04", activities: [] }] };
    expect(dayFor("2027-03-01", legs)).toBe("before");
    expect(dayFor("2027-04-03", legs)).toBe("d1");
    expect(dayFor("2027-04-05", legs)).toBe("kyoto");
    expect(dayFor("2027-04-07", legs)).toBe("after");
    expect(dayFor(undefined, legs)).toBeUndefined();
    // Without stored dates, day N is the start date plus N - 1.
    expect(dayFor("2027-04-03", trip)).toBe("d2");
  });

  test("counts bookings under the same category the itinerary shows them in", () => {
    expect(BOOKING_CATEGORY).toEqual(Object.fromEntries(Object.entries(CATEGORY_FOR).map(([k, v]) => [k, v.category])));
  });

  test("guesses what an expense was for in any of the app's languages", () => {
    expect(guessCategory("Taxi to the airport")).toBe("transport");
    expect(guessCategory("Cena en el puerto")).toBe("food");
    expect(guessCategory("Hôtel du Nord")).toBe("lodging");
    expect(guessCategory("Museumseintritt")).toBe("sightseeing");
    expect(guessCategory("お土産")).toBe("shopping");
    expect(guessCategory("Misc")).toBe("other");
  });
});

describe("budget.overview query", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-04-03T03:00:00Z"));
    vi.stubEnv("ALERTS_DEMO", "true");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("returns shared costs with my share, priced bookings and open fare watches", async () => {
    const t = convexTest(schema, modules);
    const ana = t.withIdentity({ subject: "ana", name: "Ana" });
    const tripId = await ana.mutation(api.seed.demoTrip, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const trip = (await ana.query(api.trips.get, { tripId }))!;
    const activityId = trip.subTrips[0]!.activities[0]!._id;

    await ana.mutation(api.expenses.add, { tripId, description: "Taxi from Haneda", amountCents: 900000, paidBy: "ana", split: { mode: "equal", people: ["ana"] } });
    await ana.mutation(api.expenses.add, { tripId, description: "Snacks", amountCents: 50000, paidBy: "ana", split: { mode: "equal", people: ["ana"] }, category: "food" });
    await t.run(async (ctx) => {
      await ctx.db.insert("bookings", { tripId, addedBy: "ana", kind: "hotel", title: "Park Hyatt", activityId: activityId as Id<"activities">, startDate: trip.startDate, priceCents: 9_000_000, priceCurrency: "JPY" });
      const flight = await ctx.db.insert("bookings", { tripId, addedBy: "ana", kind: "flight", title: "UA 837", startDate: trip.startDate });
      await ctx.db.insert("priceWatches", { tripId, bookingId: flight, kind: "flight", createdBy: "ana", adults: 1, currency: "USD", paidCents: 110000, history: [], checks: 0, status: "active" });
      await ctx.db.insert("bookings", { tripId, addedBy: "ana", kind: "tour", title: "No price" });
      await ctx.db.insert("fareWatches", { tripId, userId: "ana", from: "SFO", to: "HND", outboundDate: trip.startDate, adults: 1, currency: "USD", lastCents: 95000, history: [], offers: [], checks: 1, status: "active" });
      await ctx.db.insert("fareWatches", { tripId, userId: "ana", from: "LAX", to: "HND", outboundDate: trip.startDate, adults: 1, currency: "USD", lastCents: 80000, history: [], offers: [], checks: 1, status: "booked" });
    });

    const data = (await ana.query(api.budget.overview, { tripId }))!;
    expect(data.travelers).toBe(1);
    expect(data.expenses.map((e) => [e.category, e.totalCents, e.myShareCents, e.date])).toEqual([
      ["transport", 900000, 900000, "2027-04-03"],
      ["food", 50000, 50000, "2027-04-03"],
    ]);
    expect(data.bookings.map((b) => [b.kind, b.cents, b.currency, b.people])).toEqual([
      ["hotel", 9_000_000, "JPY", 1],
      ["flight", 110000, "USD", 1],
    ]);
    expect(data.fares).toEqual([expect.objectContaining({ isMine: true, cents: 95000, currency: "USD" })]);

    // And it adds up in the app.
    const view = budgetOverview({ trip, extras: data, scope: "me", display: data.tripCurrency, rates: { USD: 150, [data.groupCurrency]: 1 } });
    expect(view.bySource.find((s) => s.source === "shared")!.spent).toBe(9500);
    expect(view.bySource.find((s) => s.source === "bookings")).toMatchObject({ planned: 90000 + 1100 * 150, spent: 90000 + 1100 * 150 });
    expect(view.bySource.find((s) => s.source === "flights")!.planned).toBe(950 * 150);

    // Expenses keep the category for the edit form too.
    const split = (await ana.query(api.expenses.forTrip, { tripId }))!;
    expect(split.entries.filter((e) => e.kind === "expense").map((e) => e.kind === "expense" && e.category).sort()).toEqual(["food", "transport"]);

    // Not on the trip: nothing.
    expect(await t.withIdentity({ subject: "eve" }).query(api.budget.overview, { tripId })).toBeNull();
  });
});
