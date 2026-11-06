/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { fareAlert, googleFlightsUrl, guessAirport, parseFares, shiftDate } from "./lib/fares";
import { affiliateUrl, aviasalesUrl, insightsFromGrid, parseTp } from "./lib/travelpayouts";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("reading Google Flights", () => {
  const leg = (from: string, dep: string, to: string, arr: string, no: string) => ({
    departure_airport: { id: from, time: dep },
    arrival_airport: { id: to, time: arr },
    airline: "ANA",
    flight_number: no,
  });
  test("cheapest fare, best options first, and Google's price insights", () => {
    const res = parseFares({
      best_flights: [{ flights: [leg("SFO", "2027-04-02 11:40", "HND", "2027-04-03 15:10", "NH 7")], price: 1210, total_duration: 690 }],
      other_flights: [
        { flights: [leg("SFO", "2027-04-02 08:00", "LAX", "2027-04-02 09:30", "UA 1"), leg("LAX", "2027-04-02 11:00", "HND", "2027-04-03 16:00", "UA 2")], price: 980, total_duration: 960 },
        { flights: [leg("SFO", "2027-04-02 22:00", "HND", "2027-04-04 05:00", "JL 1")], price: 1500 },
        { flights: [], price: 10 },
      ],
      price_insights: { lowest_price: 980, price_level: "low", typical_price_range: [1000, 1400], price_history: [[1774000000, 1100], [1774086400, 1000]] },
      search_metadata: { google_flights_url: "https://www.google.com/travel/flights?tfs=abc" },
    })!;
    expect(res.cents).toBe(98000);
    expect(res.offers.map((o) => o.flightNumbers)).toEqual(["NH 7", "UA 1 · UA 2", "JL 1"]);
    expect(res.offers[1]).toMatchObject({ stops: 1, depTime: "08:00", arrDate: "2027-04-03", arrTime: "16:00", cents: 98000 });
    expect(res.insights).toEqual({ level: "low", typicalLowCents: 100000, typicalHighCents: 140000, history: [{ at: 1774000000000, cents: 110000 }, { at: 1774086400000, cents: 100000 }] });
    expect(res.googleUrl).toContain("tfs=abc");
    expect(parseFares({ best_flights: [], other_flights: [] })).toBeNull();
    // Only Google's own links are passed on.
    expect(parseFares({ other_flights: [{ flights: [leg("A", "2027-01-01 01:00", "B", "2027-01-01 02:00", "X 1")], price: 5 }], search_metadata: { google_flights_url: "https://evil.example" } })!.googleUrl).toBeUndefined();
  });

  test("a Google Flights link that works without SerpApi", () => {
    const url = new URL(googleFlightsUrl("SFO", "HND", "2027-04-02", "2027-04-06", 2, "USD"));
    expect(url.searchParams.get("q")).toBe("Flights from SFO to HND on 2027-04-02 through 2027-04-06 for 2 adults");
  });

  test("guesses the destination airport", () => {
    expect(guessAirport("Tokyo & Kyoto, Japan")).toBe("HND");
    expect(guessAirport("Lisboa, Portugal")).toBe("LIS");
    expect(guessAirport("Somewhere quiet")).toBeUndefined();
  });

  test("alerts on a real drop, or once at the target", () => {
    expect(fareAlert({ firstCents: 100000 }, 97000)).toBeNull();
    expect(fareAlert({ firstCents: 100000 }, 94000)).toEqual({ kind: "drop", wasCents: 100000 });
    // With a target only the target counts.
    expect(fareAlert({ firstCents: 100000, targetCents: 80000 }, 90000)).toBeNull();
    expect(fareAlert({ firstCents: 100000, lastCents: 85000, targetCents: 80000 }, 79000)).toEqual({ kind: "target", wasCents: 85000 });
    expect(fareAlert({ firstCents: 100000, lastCents: 79000, alertedCents: 79000, targetCents: 80000 }, 78000)).toBeNull();
    expect(fareAlert({ firstCents: 100000, lastCents: 79000, alertedCents: 79000, targetCents: 80000 }, 70000)).toEqual({ kind: "target", wasCents: 79000 });
  });
});

describe("reading Travelpayouts", () => {
  const res = {
    success: true,
    data: [
      { price: 640, airline: "UA", flight_number: 837, departure_at: "2027-04-02T10:55:00-07:00", return_at: "2027-04-08T17:00:00+09:00", transfers: 0, duration_to: 690 },
      { price: 590, airline: "NH", flight_number: "7", departure_at: "2027-04-02T11:40:00-07:00", return_at: "2027-04-08T17:05:00+09:00", transfers: 0, duration_to: 690 },
      { price: 400, airline: "ZZ", flight_number: 1, departure_at: "2027-04-03T08:00:00-07:00", return_at: "2027-04-08T10:00:00+09:00" },
    ],
  };
  test("cheapest fare for everyone on these exact dates", () => {
    const found = parseTp(res, { outboundDate: "2027-04-02", returnDate: "2027-04-08", adults: 2 })!;
    expect(found.cents).toBe(118000);
    expect(found.offers.map((o) => o.flightNumbers)).toEqual(["NH 7", "UA 837"]);
    expect(found.offers[0]).toMatchObject({ depTime: "11:40", stops: 0, durationMinutes: 690, cents: 118000, logo: "https://pics.avs.io/60/60/NH.png" });
    expect(found.offers[0]!.arrTime).toBeUndefined();
    expect(parseTp({ data: [] }, { outboundDate: "2027-04-02", adults: 1 })).toBeNull();
  });
  test("price level from the nearby days", () => {
    expect(insightsFromGrid(90000, [100000, 110000, 120000, 95000])).toMatchObject({ level: "low", typicalLowCents: 95000, typicalHighCents: 110000 });
    expect(insightsFromGrid(130000, [100000, 110000, 120000, 95000])!.level).toBe("high");
    expect(insightsFromGrid(100000, [undefined, 110000])).toBeUndefined();
  });
  test("Aviasales links, as affiliate links when there's a marker", () => {
    const url = aviasalesUrl("SFO", "HND", "2027-04-02", "2027-04-08", 2);
    expect(url).toBe("https://www.aviasales.com/search/SFO0204HND08042");
    expect(affiliateUrl(url, undefined)).toBe(url);
    const aff = new URL(affiliateUrl(url, "12345"));
    expect(aff.host).toBe("tp.media");
    expect(aff.searchParams.get("marker")).toBe("12345");
    expect(aff.searchParams.get("u")).toBe(url);
  });
});

describe("fare watch with Travelpayouts (shared cache)", () => {
  let calls: string[] = [];
  beforeEach(() => {
    calls = [];
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-01T12:00:00Z"));
    vi.stubEnv("TRAVELPAYOUTS_TOKEN", "tp-token");
    vi.stubEnv("TRAVELPAYOUTS_MARKER", "777");
    vi.stubEnv("SERPAPI_API_KEY", "serp-key");
    vi.stubEnv("LIVE_FARE_CHECKS_PER_DAY", "1");
    vi.stubEnv("ALERTS_DEMO", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        calls.push(url.host);
        if (url.host === "serpapi.com")
          return Response.json({ other_flights: [{ flights: [{ departure_airport: { time: `${url.searchParams.get("outbound_date")} 11:40` }, arrival_airport: { time: "2027-04-03 15:10" }, airline: "ANA", flight_number: "NH 7" }], price: 1300 }] });
        const day = url.searchParams.get("departure_at")!;
        const ret = url.searchParams.get("return_at")!;
        const shift = (Date.parse(day) - Date.parse("2027-04-02")) / 86_400_000;
        return Response.json({ success: true, data: [{ price: 600 + shift * 25, airline: "NH", flight_number: 7, departure_at: `${day}T11:40:00-07:00`, return_at: `${ret}T17:05:00+09:00`, transfers: 0, duration_to: 690 }] });
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("one search per route and dates for everyone, the grid comes with it, and Book links to Aviasales", async () => {
    const t = convexTest(schema, modules);
    const ana = t.withIdentity({ subject: "ana", name: "Ana" });
    const tripId = await ana.mutation(api.seed.demoTrip, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const bo = t.withIdentity({ subject: "bo", name: "Bo" });
    await t.run(async (ctx) => {
      await ctx.db.insert("tripMembers", { tripId, userId: "bo", role: "member", name: "Bo" });
    });

    await ana.mutation(api.fares.watch, { tripId, from: "SFO", to: "HND", roundTrip: true, adults: 2 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.filter((h) => h === "api.travelpayouts.com")).toHaveLength(7);
    const watch = (await ana.query(api.fares.forTrip, { tripId }))!.watch!;
    expect(watch).toMatchObject({ source: "travelpayouts", lastCents: 120000, bookSite: "Aviasales" });
    expect(watch.flex!.cells.map((c) => c.cents)).toEqual([105000, 110000, 115000, 120000, 125000, 130000, 135000]);
    expect(watch.insights?.level).toBe("typical");
    expect(new URL(watch.bookUrl).searchParams.get("u")).toContain("aviasales.com/search/SFO0204HND");

    // Bo watches the same route: all from the cache.
    await bo.mutation(api.fares.watch, { tripId, from: "SFO", to: "HND", roundTrip: true, adults: 1 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.filter((h) => h === "api.travelpayouts.com")).toHaveLength(7);
    expect((await bo.query(api.fares.forTrip, { tripId }))!.watch!.lastCents).toBe(60000);

    // Tapping Book runs one live Google Flights check, within the daily budget.
    await ana.mutation(api.fares.bookStarted, { tripId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.filter((h) => h === "serpapi.com")).toHaveLength(1);
    expect((await ana.query(api.fares.forTrip, { tripId }))!.watch).toMatchObject({ source: "google", lastCents: 130000 });
    await bo.mutation(api.fares.bookStarted, { tripId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.filter((h) => h === "serpapi.com")).toHaveLength(1);
  });
});

describe("fare watch end to end (demo provider)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-01T12:00:00Z"));
    vi.stubEnv("SERPAPI_API_KEY", "");
    vi.stubEnv("ALERTS_DEMO", "true");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function setup() {
    const t = convexTest(schema, modules);
    const ana = t.withIdentity({ subject: "ana", name: "Ana" });
    const tripId = await ana.mutation(api.seed.demoTrip, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return { t, ana, tripId };
  }
  type User = ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
  const feed = async (user: User) => (await user.query(api.notifications.feed, {}))!.items.map((n) => n.kind);

  test("watches the trip's dates from home, and only the watcher hears about drops", async () => {
    const { t, ana, tripId } = await setup();
    let data = (await ana.query(api.fares.forTrip, { tripId }))!;
    expect(data).toMatchObject({ enabled: true, suggestedTo: "HND", watch: null, startDate: "2027-04-02" });
    expect(data.homeAirport).toBeUndefined();

    await expect(ana.mutation(api.fares.watch, { tripId, from: "SF", to: "HND", roundTrip: true, adults: 2 })).rejects.toThrow(/airport codes/);
    await ana.mutation(api.fares.watch, { tripId, from: "sfo", to: "HND", roundTrip: true, adults: 2 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    data = (await ana.query(api.fares.forTrip, { tripId }))!;
    expect(data.homeAirport).toBe("SFO");
    const watch = data.watch!;
    expect(watch).toMatchObject({ from: "SFO", to: "HND", outboundDate: "2027-04-02", returnDate: data.endDate, adults: 2, currency: "USD", checks: 1 });
    expect(watch.offers).toHaveLength(3);
    expect(watch.insights?.level).toBe("typical");
    expect(watch.bookUrl).toContain("google.com/travel/flights");

    // Next day it's ~6% cheaper: a push for Ana.
    vi.setSystemTime(new Date("2027-02-02T13:30:00Z"));
    await t.action(internal.fares.checkAll, {});
    expect((await ana.query(api.fares.forTrip, { tripId }))!.watch!.lastCents).toBeLessThan(watch.firstCents!);
    expect(await feed(ana)).toEqual(["fareDrop"]);

    // Booking it ends the watch.
    await ana.mutation(api.fares.bookStarted, { tripId });
    expect((await ana.query(api.fares.forTrip, { tripId }))!.watch!.bookStartedAt).toBeDefined();
    await ana.mutation(api.fares.notBookedYet, { tripId });
    expect((await ana.query(api.fares.forTrip, { tripId }))!.watch!.bookStartedAt).toBeUndefined();

    await ana.mutation(api.fares.stop, { tripId });
    expect((await ana.query(api.fares.forTrip, { tripId }))!.watch).toBeNull();
  });

  test("checks nearby dates, and the organizer can move the trip there", async () => {
    const { t, ana, tripId } = await setup();
    await ana.mutation(api.fares.watch, { tripId, from: "SFO", to: "HND", roundTrip: true, adults: 1 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await ana.mutation(api.fares.checkNearbyDates, { tripId });
    expect((await ana.query(api.fares.forTrip, { tripId }))!.watch!.flexStatus).toBe("checking");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    let watch = (await ana.query(api.fares.forTrip, { tripId }))!.watch!;
    expect(watch.flexStatus).toBeUndefined();
    expect(watch.flex!.cells.map((c) => c.shiftDays)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(watch.flex!.cells.every((c) => c.cents! > 0)).toBe(true);
    expect(watch.flex!.cells[3]!.cents).toBe(watch.lastCents);

    const before = await ana.query(api.trips.get, { tripId });
    await ana.mutation(api.fares.moveTrip, { tripId, days: 2 });
    const after = (await ana.query(api.trips.get, { tripId }))!;
    expect(after.startDate).toBe(shiftDate(before!.startDate, 2));
    expect(after.subTrips[0]!.date).toBe(shiftDate(before!.subTrips[0]!.date!, 2));
    watch = (await ana.query(api.fares.forTrip, { tripId }))!.watch!;
    expect(watch.outboundDate).toBe(after.startDate);
    // The grid now counts from the new dates.
    expect(watch.flex!.cells.map((c) => c.shiftDays)).toEqual([-3, -2, -1, 0, 1]);

    // Not with bookings on the trip.
    await t.run((ctx) => ctx.db.insert("bookings", { tripId, addedBy: "ana", kind: "hotel", title: "Park Hyatt" }));
    await expect(ana.mutation(api.fares.moveTrip, { tripId, days: 1 })).rejects.toThrow(/bookings/);
  });
});
