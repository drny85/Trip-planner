import { v } from "convex/values";
import { defaultLocale, isLocale, translator } from "@trip/i18n";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import {
  type AdbFlight,
  airportsOf,
  demoFlight,
  demoPrice,
  flightNews,
  flightNumberOf,
  type FlightSnapshot,
  flightSnapshot,
  HOUR,
  isAirportCode,
  isoDay,
  nextFlightCheck,
  nightsBetween,
  parseFlightStatus,
  pickFlightPrice,
  pickHotelPrice,
  priceDrop,
  roughDeparture,
  type SerpFlightsResponse,
  type SerpHotelsResponse,
} from "./lib/alerts";
import { findMembership, getMemberTrip, getOptionalUserId } from "./lib/auth";
import { listMembers } from "./lib/members";
import { notify } from "./lib/notify";

/**
 * Price and flight alerts for a trip's bookings.
 *
 * - Prices: anyone on the trip can watch a flight or hotel booking. A daily cron
 *   (crons.ts) asks SerpApi's Google Flights / Google Hotels for today's price,
 *   and everyone on the trip gets a push when it drops.
 * - Flight status: every flight booking with a flight number is tracked by
 *   itself. Checks get closer together as departure nears (lib/alerts.ts), and
 *   everyone hears about delays, gate changes and cancellations.
 *
 * Keys live in the Convex deployment's env: SERPAPI_API_KEY and
 * AERODATABOX_API_KEY. Without them nothing is called and the apps say alerts
 * are off. ALERTS_DEMO=true makes up prices and statuses, to try it all out.
 */

const serpKey = () => process.env.SERPAPI_API_KEY;
const flightKey = () => process.env.AERODATABOX_API_KEY;
const isDemo = () => process.env.ALERTS_DEMO === "true";
const pricesOn = () => Boolean(serpKey()) || isDemo();
const flightsOn = () => Boolean(flightKey()) || isDemo();

/** SerpApi's free plan is 250 searches a month: 6 scheduled checks a day leaves room for first checks. */
const pricesPerDay = () => Math.max(1, Number(process.env.PRICE_CHECKS_PER_DAY) || 6);
const MAX_WATCHES_PER_TRIP = 10;

type Key = Parameters<ReturnType<typeof translator>>[0];
const failIn = (language?: string) => (key: Key, vars?: Record<string, string | number>) =>
  new Error(translator(isLocale(language) ? language : defaultLocale)(key, vars));

/** Everything the bookings list needs to show alerts. */
export const forTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const [watches, tracks, bookings, members] = await Promise.all([
      ctx.db.query("priceWatches").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("flightTracks").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("bookings").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      listMembers(ctx, trip),
    ]);
    return {
      pricesEnabled: pricesOn(),
      flightsEnabled: flightsOn(),
      currency: trip.currency ?? "USD",
      travelers: members.length,
      /** What we could read off each flight or hotel booking, to fill in the watch form. */
      watchable: bookings
        .filter((b) => b.kind === "flight" || b.kind === "hotel")
        .map((b) => ({ bookingId: b._id, kind: b.kind, flightNumber: flightNumberOf(b), ...airportsOf(b) })),
      watches: watches.map(({ _creationTime, createdBy: _c, propertyToken: _p, history, ...w }) => ({ ...w, history: history.slice(-30) })),
      tracks: tracks.map(({ _creationTime, alerted: _a, ...tr }) => tr),
    };
  },
});

/**
 * Starts (or updates) a price watch on a flight or hotel booking. Flights need
 * the two airport codes, which are read off the title when they're there.
 */
export const watchPrice = mutation({
  args: {
    bookingId: v.id("bookings"),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    /** What they paid for the whole booking, in cents of the trip currency. */
    paidCents: v.optional(v.number()),
    adults: v.optional(v.number()),
    /** App language, for error messages. */
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const fail = failIn(args.language);
    const booking = await ctx.db.get("bookings", args.bookingId);
    if (!booking) throw new Error("Booking not found");
    const { trip, userId } = await getMemberTrip(ctx, booking.tripId);
    if (booking.kind !== "flight" && booking.kind !== "hotel") throw fail("alerts.errKind");
    if (!booking.startDate || (booking.kind === "hotel" && !booking.endDate)) throw fail("alerts.errNoDate");
    if (booking.startDate < isoDay(Date.now())) throw fail("alerts.errPast");

    const parsed = airportsOf(booking);
    const from = (args.from ?? parsed.from)?.trim().toUpperCase();
    const to = (args.to ?? parsed.to)?.trim().toUpperCase();
    if (booking.kind === "flight" && !(isAirportCode(from) && isAirportCode(to) && from !== to)) throw fail("alerts.errAirports");
    const paidCents = args.paidCents !== undefined && args.paidCents > 0 ? Math.round(args.paidCents) : undefined;
    const adults = Math.min(9, Math.max(1, Math.round(args.adults ?? (booking.kind === "hotel" ? 2 : 1))));

    const fields = {
      from: booking.kind === "flight" ? from : undefined,
      to: booking.kind === "flight" ? to : undefined,
      flightNumber: flightNumberOf(booking),
      paidCents,
      adults,
      currency: trip.currency ?? "USD",
    };
    const existing = await ctx.db.query("priceWatches").withIndex("by_bookingId", (q) => q.eq("bookingId", booking._id)).unique();
    let watchId: Id<"priceWatches">;
    if (existing) {
      // New route or travelers means a new price to compare against.
      const reset = existing.from !== fields.from || existing.to !== fields.to || existing.adults !== adults || existing.currency !== fields.currency;
      await ctx.db.patch("priceWatches", existing._id, {
        ...fields,
        status: "active",
        alertedCents: reset ? undefined : existing.alertedCents,
        ...(reset ? { firstCents: undefined, lastCents: undefined, lowestCents: undefined, history: [], propertyToken: undefined, lastCheckedAt: undefined } : {}),
      });
      watchId = existing._id;
      if (!reset) return watchId;
    } else {
      const count = (await ctx.db.query("priceWatches").withIndex("by_tripId", (q) => q.eq("tripId", trip._id)).collect()).length;
      if (count >= MAX_WATCHES_PER_TRIP) throw fail("alerts.errTooMany", { count: MAX_WATCHES_PER_TRIP });
      watchId = await ctx.db.insert("priceWatches", {
        tripId: trip._id,
        bookingId: booking._id,
        kind: booking.kind,
        createdBy: userId,
        ...fields,
        history: [],
        checks: 0,
        status: "active",
      });
    }
    // The first price right away, so there's something to compare against.
    if (pricesOn()) await ctx.scheduler.runAfter(0, internal.alerts.checkPrice, { watchId });
    return watchId;
  },
});

export const stopWatching = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const booking = await ctx.db.get("bookings", bookingId);
    if (!booking) return;
    await getMemberTrip(ctx, booking.tripId);
    const watch = await ctx.db.query("priceWatches").withIndex("by_bookingId", (q) => q.eq("bookingId", bookingId)).unique();
    if (watch) await ctx.db.delete("priceWatches", watch._id);
  },
});

/** Turns delay and gate alerts for one flight off or back on, for the whole trip. */
export const setFlightAlerts = mutation({
  args: { bookingId: v.id("bookings"), on: v.boolean() },
  handler: async (ctx, { bookingId, on }) => {
    const booking = await ctx.db.get("bookings", bookingId);
    if (!booking) throw new Error("Booking not found");
    await getMemberTrip(ctx, booking.tripId);
    const track = (await ctx.db.query("flightTracks").withIndex("by_bookingId", (q) => q.eq("bookingId", bookingId)).unique()) ?? (on ? await ensureFlightTrack(ctx, booking) : null);
    if (!track) return;
    const depUtc = track.snapshot?.depUtc ?? roughDeparture(track.date, track.time);
    await ctx.db.patch("flightTracks", track._id, {
      muted: !on,
      nextCheckAt: on ? (nextFlightCheck(Date.now(), depUtc, track.snapshot?.status) ?? undefined) : undefined,
    });
  },
});

/**
 * Starts tracking a flight booking's status, when it has a flight number and
 * hasn't left yet. Called when a booking is added (bookings.apply).
 */
export async function ensureFlightTrack(ctx: MutationCtx, booking: Doc<"bookings">): Promise<Doc<"flightTracks"> | null> {
  const flightNumber = flightNumberOf(booking);
  if (!flightNumber || !booking.startDate) return null;
  const existing = await ctx.db.query("flightTracks").withIndex("by_bookingId", (q) => q.eq("bookingId", booking._id)).unique();
  if (existing) return existing;
  const now = Date.now();
  const next = nextFlightCheck(now, roughDeparture(booking.startDate, booking.startTime));
  if (next === null) return null;
  const id = await ctx.db.insert("flightTracks", {
    tripId: booking.tripId,
    bookingId: booking._id,
    flightNumber,
    date: booking.startDate,
    time: booking.startTime,
    from: airportsOf(booking).from,
    muted: false,
    nextCheckAt: next,
    checks: 0,
    alerted: {},
  });
  return ctx.db.get("flightTracks", id);
}

/** Removes a booking's watch and tracking; called when the booking is removed. */
export async function deleteAlertsFor(ctx: MutationCtx, bookingId: Id<"bookings">) {
  const [watch, track] = await Promise.all([
    ctx.db.query("priceWatches").withIndex("by_bookingId", (q) => q.eq("bookingId", bookingId)).unique(),
    ctx.db.query("flightTracks").withIndex("by_bookingId", (q) => q.eq("bookingId", bookingId)).unique(),
  ]);
  if (watch) await ctx.db.delete("priceWatches", watch._id);
  if (track) await ctx.db.delete("flightTracks", track._id);
}

/** Starts tracking flights that were added before alerts existed. Run once: `npx convex run alerts:backfillFlightTracks`. */
export const backfillFlightTracks = internalMutation({
  args: {},
  handler: async (ctx) => {
    let added = 0;
    for await (const booking of ctx.db.query("bookings")) {
      if (booking.kind !== "flight") continue;
      const before = await ctx.db.query("flightTracks").withIndex("by_bookingId", (q) => q.eq("bookingId", booking._id)).unique();
      if (!before && (await ensureFlightTrack(ctx, booking))) added++;
    }
    return added;
  },
});

// ---------- Prices ----------

/** Watches not checked in the last 20 hours, oldest first. */
export const duePrices = internalQuery({
  args: { now: v.number(), limit: v.number() },
  handler: async (ctx, { now, limit }) => {
    const rows = await ctx.db
      .query("priceWatches")
      .withIndex("by_status_lastCheckedAt", (q) => q.eq("status", "active").lt("lastCheckedAt", now - 20 * HOUR))
      .take(limit);
    return rows.map((r) => r._id);
  },
});

/** The daily price check (crons.ts). */
export const checkPrices = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    if (!pricesOn()) return;
    const ids = await ctx.runQuery(internal.alerts.duePrices, { now: Date.now(), limit: pricesPerDay() });
    for (const watchId of ids) await ctx.runAction(internal.alerts.checkPrice, { watchId });
  },
});

export const priceJob = internalQuery({
  args: { watchId: v.id("priceWatches") },
  handler: async (ctx, { watchId }) => {
    const watch = await ctx.db.get("priceWatches", watchId);
    const booking = watch && (await ctx.db.get("bookings", watch.bookingId));
    const trip = booking && (await ctx.db.get("trips", booking.tripId));
    if (!watch || !booking || !trip || watch.status !== "active") return null;
    return { watch, booking, destination: trip.destination };
  },
});

/** Looks up one watch's price today and records it. */
export const checkPrice = internalAction({
  args: { watchId: v.id("priceWatches") },
  handler: async (ctx, { watchId }): Promise<void> => {
    const job = await ctx.runQuery(internal.alerts.priceJob, { watchId });
    if (!job) return;
    const { watch, booking } = job;
    const now = Date.now();
    if (!booking.startDate || booking.startDate < isoDay(now)) {
      await ctx.runMutation(internal.alerts.recordPrice, { watchId, now, ended: true });
      return;
    }
    try {
      const found = isDemo() ? { cents: demoPrice(booking._id, watch.checks), matched: true } : await fetchPrice(job);
      await ctx.runMutation(internal.alerts.recordPrice, { watchId, now, ...(found ? found : { error: "noResults" }) });
    } catch (error) {
      console.warn("Price check failed", error);
      await ctx.runMutation(internal.alerts.recordPrice, { watchId, now, error: "failed" });
    }
  },
});

type PriceJob = { watch: Doc<"priceWatches">; booking: Doc<"bookings">; destination: string };

async function fetchPrice({ watch, booking, destination }: PriceJob) {
  const key = serpKey();
  if (!key) return null;
  const params = new URLSearchParams({ api_key: key, currency: watch.currency, hl: "en", adults: String(watch.adults) });
  if (watch.kind === "flight") {
    params.set("engine", "google_flights");
    params.set("type", "2");
    params.set("departure_id", watch.from!);
    params.set("arrival_id", watch.to!);
    params.set("outbound_date", booking.startDate!);
  } else {
    params.set("engine", "google_hotels");
    params.set("check_in_date", booking.startDate!);
    params.set("check_out_date", booking.endDate!);
    if (watch.propertyToken) params.set("property_token", watch.propertyToken);
    params.set("q", `${booking.provider ?? booking.title} ${destination}`.slice(0, 200));
  }
  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) throw new Error(`SerpApi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as SerpFlightsResponse & SerpHotelsResponse;
  if (watch.kind === "flight") return pickFlightPrice(json, watch.flightNumber);
  return pickHotelPrice(json, booking.provider ?? booking.title, nightsBetween(booking.startDate!, booking.endDate!), destination);
}

export const recordPrice = internalMutation({
  args: {
    watchId: v.id("priceWatches"),
    now: v.number(),
    cents: v.optional(v.number()),
    matched: v.optional(v.boolean()),
    propertyToken: v.optional(v.string()),
    error: v.optional(v.string()),
    ended: v.optional(v.boolean()),
  },
  handler: async (ctx, { watchId, now, cents, matched, propertyToken, error, ended }) => {
    const watch = await ctx.db.get("priceWatches", watchId);
    if (!watch || watch.status !== "active") return;
    if (ended) return await ctx.db.patch("priceWatches", watchId, { status: "ended", lastCheckedAt: now });
    if (cents === undefined) return await ctx.db.patch("priceWatches", watchId, { lastCheckedAt: now, checks: watch.checks + 1, error });

    const drop = priceDrop(watch, cents);
    await ctx.db.patch("priceWatches", watchId, {
      lastCheckedAt: now,
      checks: watch.checks + 1,
      error: undefined,
      matched,
      propertyToken: propertyToken ?? watch.propertyToken,
      firstCents: watch.firstCents ?? cents,
      lastCents: cents,
      lowestCents: Math.min(cents, watch.lowestCents ?? cents),
      history: [...watch.history, { at: now, cents }].slice(-60),
      ...(drop ? { alertedCents: cents } : {}),
    });
    if (!drop) return;
    const [booking, trip] = await Promise.all([ctx.db.get("bookings", watch.bookingId), ctx.db.get("trips", watch.tripId)]);
    if (!booking || !trip) return;
    await notify(ctx, trip, { kind: "priceDrop", params: { title: booking.title, amountCents: cents, wasCents: drop.wasCents, currency: watch.currency } });
  },
});

// ---------- Flight status ----------

export const dueFlights = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const rows = await ctx.db
      .query("flightTracks")
      .withIndex("by_nextCheckAt", (q) => q.gte("nextCheckAt", 0).lte("nextCheckAt", now))
      .take(25);
    return rows.filter((r) => !r.muted).map(({ _id, flightNumber, date, time, from, checks, snapshot }) => ({ _id, flightNumber, date, time, from, checks, snapshot }));
  },
});

/** Every 15 minutes (crons.ts): checks the flights that are due. */
export const checkFlights = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    if (!flightsOn()) return;
    const now = Date.now();
    const due = await ctx.runQuery(internal.alerts.dueFlights, { now });
    for (const track of due) {
      try {
        const snapshot = isDemo()
          ? demoFlight(track.snapshot?.depUtc ?? roughDeparture(track.date, track.time), track.checks, track.time)
          : await fetchFlight(track.flightNumber, track.date, track.from);
        await ctx.runMutation(internal.alerts.recordFlight, { trackId: track._id, now, snapshot: snapshot ?? undefined, error: snapshot ? undefined : "noResults" });
      } catch (error) {
        console.warn("Flight check failed", track.flightNumber, error);
        await ctx.runMutation(internal.alerts.recordFlight, { trackId: track._id, now, error: "failed" });
      }
    }
  },
});

async function fetchFlight(flightNumber: string, date: string, from?: string): Promise<FlightSnapshot | null> {
  const key = flightKey();
  if (!key) return null;
  const host = process.env.AERODATABOX_HOST ?? "aerodatabox.p.rapidapi.com";
  const url = `https://${host}/flights/number/${encodeURIComponent(flightNumber)}/${date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false`;
  const res = await fetch(url, { headers: { "x-rapidapi-key": key, "x-rapidapi-host": host } });
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error(`AeroDataBox ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parseFlightStatus((await res.json()) as AdbFlight[], date, from);
}

export const recordFlight = internalMutation({
  args: { trackId: v.id("flightTracks"), now: v.number(), snapshot: v.optional(flightSnapshot), error: v.optional(v.string()) },
  handler: async (ctx, { trackId, now, snapshot, error }) => {
    const track = await ctx.db.get("flightTracks", trackId);
    if (!track || track.muted) return;
    const depUtc = snapshot?.depUtc ?? track.snapshot?.depUtc ?? roughDeparture(track.date, track.time);
    const status = snapshot?.status ?? track.snapshot?.status;
    const next = nextFlightCheck(now, depUtc, status);
    const base = { lastCheckedAt: now, checks: track.checks + 1, nextCheckAt: next ?? undefined, error };
    if (!snapshot) return await ctx.db.patch("flightTracks", trackId, base);

    const news = flightNews(snapshot, track.alerted);
    await ctx.db.patch("flightTracks", trackId, {
      ...base,
      snapshot,
      alerted: {
        canceled: news.canceled ?? track.alerted.canceled,
        delayMinutes: news.delay ? news.delay.minutes : track.alerted.delayMinutes,
        gate: news.gate ?? track.alerted.gate,
      },
    });
    if (!news.canceled && !news.delay && !news.gate) return;
    const [booking, trip] = await Promise.all([ctx.db.get("bookings", track.bookingId), ctx.db.get("trips", track.tripId)]);
    if (!booking || !trip) return;
    const title = booking.title;
    if (news.canceled) return await notify(ctx, trip, { kind: "flightCanceled", params: { title } });
    if (news.delay) await notify(ctx, trip, { kind: "flightDelay", params: { title, count: news.delay.minutes, time: news.delay.time } });
    if (news.gate) await notify(ctx, trip, { kind: "flightGate", params: { title, item: news.gate } });
  },
});
