/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  airportsOf,
  flightNews,
  flightNumberOf,
  HOUR,
  MINUTE,
  nextFlightCheck,
  parseFlightStatus,
  pickFlightPrice,
  pickHotelPrice,
  priceDrop,
} from "./lib/alerts";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("reading bookings", () => {
  const flight = { kind: "flight", title: "Flight UA 837 · SFO → NRT", details: "Seat 32A · Gate B12" };
  test("finds the flight number in the title, not the gate", () => {
    expect(flightNumberOf(flight)).toBe("UA837");
    expect(flightNumberOf({ kind: "flight", title: "Vuelo a Tokio", details: "Gate B12" })).toBeUndefined();
    expect(flightNumberOf({ kind: "flight", title: "Flight to Tokyo" })).toBeUndefined();
    expect(flightNumberOf({ kind: "hotel", title: "Park Hyatt UA 837" })).toBeUndefined();
  });
  test("finds the route", () => {
    expect(airportsOf(flight)).toEqual({ from: "SFO", to: "NRT" });
    expect(airportsOf({ kind: "flight", title: "JL61 LAX-HND" })).toEqual({ from: "LAX", to: "HND" });
    expect(airportsOf({ kind: "flight", title: "Flight JL 61", address: "Los Angeles Intl (LAX)" })).toEqual({ from: "LAX" });
  });
});

describe("prices", () => {
  test("our flight's fare when it's listed, else the cheapest", () => {
    const res = {
      best_flights: [{ flights: [{ flight_number: "NH 7" }], price: 980 }],
      other_flights: [{ flights: [{ flight_number: "UA 837" }], price: 1120 }],
    };
    expect(pickFlightPrice(res, "UA837")).toEqual({ cents: 112000, matched: true });
    expect(pickFlightPrice(res, "DL1")).toEqual({ cents: 98000, matched: false });
    expect(pickFlightPrice({ error: "Google hasn't returned any results" })).toBeNull();
  });
  test("finds our hotel by name, and reads a single property answer", () => {
    const res = {
      properties: [
        { name: "Hotel Gracery", property_token: "a", total_rate: { extracted_lowest: 600 } },
        { name: "Park Hyatt Tokyo", property_token: "b", rate_per_night: { extracted_lowest: 450 } },
      ],
    };
    expect(pickHotelPrice(res, "Park Hyatt", 3)).toEqual({ cents: 135000, matched: true, propertyToken: "b" });
    expect(pickHotelPrice(res, "Aman Tokyo", 3, "Tokyo, Japan")).toBeNull();
    expect(pickHotelPrice({ name: "Park Hyatt Tokyo", total_rate: { extracted_lowest: 1300 } }, "Park Hyatt", 3)).toMatchObject({ cents: 130000 });
  });
  test("only a real drop is news", () => {
    expect(priceDrop({ paidCents: 100000 }, 97000)).toBeNull(); // 3% is noise
    expect(priceDrop({ paidCents: 100000 }, 94000)).toEqual({ wasCents: 100000 });
    // After an alert, the next one needs a further drop.
    expect(priceDrop({ paidCents: 100000, alertedCents: 94000 }, 93000)).toBeNull();
    expect(priceDrop({ firstCents: 20000 }, 19500)).toBeNull(); // at least 10 units
  });
});

describe("flight status", () => {
  const answer = [
    {
      number: "UA 837",
      status: "Delayed",
      codeshareStatus: "IsOperator",
      departure: {
        airport: { iata: "SFO" },
        scheduledTime: { utc: "2027-04-01 18:40Z", local: "2027-04-01 11:40-07:00" },
        revisedTime: { utc: "2027-04-01 19:25Z", local: "2027-04-01 12:25-07:00" },
        terminal: "I",
        gate: "G98",
      },
      arrival: { airport: { iata: "NRT" }, scheduledTime: { utc: "2027-04-02 07:00Z", local: "2027-04-02 16:00+09:00" }, terminal: "1" },
    },
  ];
  test("reads delay, gate and times on the local clock", () => {
    expect(parseFlightStatus(answer, "2027-04-01", "SFO")).toMatchObject({
      status: "Delayed",
      delayMinutes: 45,
      depScheduledTime: "11:40",
      depTime: "12:25",
      depGate: "G98",
      depTerminal: "I",
      arrTime: "16:00",
      depUtc: Date.parse("2027-04-01T19:25Z"),
    });
    expect(parseFlightStatus(answer, "2027-04-02")).toBeNull();
  });
  test("news is sent once, and again only when it changes", () => {
    const snap = parseFlightStatus(answer, "2027-04-01")!;
    expect(flightNews(snap, {})).toEqual({ delay: { minutes: 45, time: "12:25" }, gate: "G98" });
    expect(flightNews(snap, { delayMinutes: 45, gate: "G98" })).toEqual({});
    expect(flightNews({ ...snap, delayMinutes: 50 }, { delayMinutes: 45, gate: "G98" })).toEqual({});
    expect(flightNews({ ...snap, delayMinutes: 70, depTime: "12:50" }, { delayMinutes: 45, gate: "G98" })).toEqual({ delay: { minutes: 70, time: "12:50" } });
    expect(flightNews({ ...snap, status: "Canceled" }, {})).toEqual({ canceled: true });
    expect(flightNews({ ...snap, status: "Departed", depGate: "G1" }, {})).toEqual({});
  });
  test("checks get closer as departure nears, and stop once it leaves", () => {
    const dep = Date.parse("2027-04-01T18:40Z");
    expect(nextFlightCheck(dep - 7 * 24 * HOUR, dep)).toBe(dep - 48 * HOUR);
    expect(nextFlightCheck(dep - 30 * HOUR, dep)).toBe(dep - 24 * HOUR);
    expect(nextFlightCheck(dep - 8 * HOUR, dep)).toBe(dep - 6 * HOUR);
    expect(nextFlightCheck(dep - 3 * HOUR, dep)).toBe(dep - 2 * HOUR);
    expect(nextFlightCheck(dep - HOUR, dep)).toBe(dep - 45 * MINUTE);
    expect(nextFlightCheck(dep - HOUR, dep, "Departed")).toBeNull();
    expect(nextFlightCheck(dep + 13 * HOUR, dep)).toBeNull();
  });
});

describe("alerts end to end (demo provider)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-03-20T12:00:00Z"));
    vi.stubEnv("SERPAPI_API_KEY", "");
    vi.stubEnv("AERODATABOX_API_KEY", "");
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
    const bookingId = await t.run((ctx) =>
      ctx.db.insert("bookings", {
        tripId,
        addedBy: "ana",
        kind: "flight",
        title: "Flight UA 837 · SFO → NRT",
        startDate: "2027-04-01",
        startTime: "11:40",
      }),
    );
    return { t, ana, tripId, bookingId };
  }

  type User = ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
  const feed = async (user: User) => (await user.query(api.notifications.feed, {}))!.items.map((n) => n.kind);

  test("a watched price that falls notifies the trip", async () => {
    const { t, ana, tripId, bookingId } = await setup();
    await expect(ana.mutation(api.alerts.watchPrice, { bookingId, from: "SF", to: "NRT" })).rejects.toThrow(/airport codes/);
    await ana.mutation(api.alerts.watchPrice, { bookingId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    let data = (await ana.query(api.alerts.forTrip, { tripId }))!;
    expect(data.pricesEnabled).toBe(true);
    const first = data.watches[0]!;
    expect(first).toMatchObject({ from: "SFO", to: "NRT", flightNumber: "UA837", currency: "JPY", checks: 1 });
    expect(first.lastCents).toBe(first.firstCents);

    // The next day's check is ~8% lower: worth telling everyone.
    vi.setSystemTime(new Date("2027-03-21T13:00:00Z"));
    await t.action(internal.alerts.checkPrices, {});
    data = (await ana.query(api.alerts.forTrip, { tripId }))!;
    expect(data.watches[0]!.lastCents).toBeLessThan(first.firstCents!);
    expect(await feed(ana)).toContain("priceDrop");

    // Checked already today: the cron skips it.
    await t.action(internal.alerts.checkPrices, {});
    expect((await ana.query(api.alerts.forTrip, { tripId }))!.watches[0]!.checks).toBe(2);

    await ana.mutation(api.alerts.stopWatching, { bookingId });
    expect((await ana.query(api.alerts.forTrip, { tripId }))!.watches).toHaveLength(0);
  });

  test("a tracked flight reports its gate and a delay, and can be muted", async () => {
    const { t, ana, tripId, bookingId } = await setup();
    await ana.mutation(api.alerts.setFlightAlerts, { bookingId, on: true });
    let track = (await ana.query(api.alerts.forTrip, { tripId }))!.tracks[0]!;
    // Twelve days out: the first look is two days before.
    expect(track.nextCheckAt).toBe(Date.parse("2027-03-30T11:40Z"));

    vi.setSystemTime(new Date("2027-03-30T12:00:00Z"));
    await t.action(internal.alerts.checkFlights, {});
    track = (await ana.query(api.alerts.forTrip, { tripId }))!.tracks[0]!;
    expect(track.snapshot).toMatchObject({ status: "Expected", depGate: "B12" });
    expect(await feed(ana)).toEqual(["flightGate"]);

    vi.setSystemTime(new Date(track.nextCheckAt!));
    await t.action(internal.alerts.checkFlights, {});
    track = (await ana.query(api.alerts.forTrip, { tripId }))!.tracks[0]!;
    expect(track.snapshot).toMatchObject({ status: "Delayed", delayMinutes: 40, depTime: "12:20", depGate: "B14" });
    expect(await feed(ana)).toEqual(["flightGate", "flightDelay", "flightGate"]);

    await ana.mutation(api.alerts.setFlightAlerts, { bookingId, on: false });
    track = (await ana.query(api.alerts.forTrip, { tripId }))!.tracks[0]!;
    expect(track).toMatchObject({ muted: true });
    expect(track.nextCheckAt).toBeUndefined();

    // Removing the booking removes its alerts.
    await ana.mutation(api.bookings.remove, { bookingId });
    expect((await ana.query(api.alerts.forTrip, { tripId }))!.tracks).toHaveLength(0);
  });
});
