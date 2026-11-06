/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { fareAlert, googleFlightsUrl, guessAirport, parseFares, shiftDate } from "./lib/fares";
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
