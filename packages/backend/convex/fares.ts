import { v } from "convex/values";
import { defaultLocale, isLocale, translator } from "@trip/i18n";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { HOUR, isAirportCode, isoDay } from "./lib/alerts";
import { findMembership, getMemberTrip, getOptionalUserId, getOwnedTrip } from "./lib/auth";
import {
  demoFare,
  demoInsights,
  demoOffers,
  fareAlert,
  type FareInsights,
  fareInsights,
  type FareOffer,
  fareOffer,
  FLEX_SHIFTS,
  flexCell,
  type FlexCell,
  googleFlightsUrl,
  guessAirport,
  parseFares,
  type SerpFareResponse,
  shiftDate,
} from "./lib/fares";
import { listMembers } from "./lib/members";
import { notify } from "./lib/notify";

/**
 * Fare watch: for travelers who haven't booked a flight yet.
 *
 * 1. They pick their home airport (remembered) and the destination airport
 *    (guessed from the trip). We look up the cheapest fare for the trip's dates
 *    right away, then once a day (crons.ts), with Google's price level, typical
 *    range and price history, so the apps can say whether it's a good time to book.
 * 2. Only they get a push when the fare drops, or reaches the price they set.
 * 3. "Nearby dates" checks the same trip moved by up to 3 days either way, and
 *    the organizer can move the whole trip to a cheaper window.
 * 4. "Book" opens Google Flights. Once their flight booking is added (booking
 *    import), the watch is done and live flight tracking (alerts.ts) takes over.
 *
 * SerpApi's free plan is 250 searches a month, shared with booking price watches:
 * FARE_CHECKS_PER_DAY (default 3) daily checks, and a nearby-dates check is 6
 * searches, at most once a day per watch. ALERTS_DEMO=true makes up fares.
 */

const serpKey = () => process.env.SERPAPI_API_KEY;
const isDemo = () => process.env.ALERTS_DEMO === "true";
const faresOn = () => Boolean(serpKey()) || isDemo();
const checksPerDay = () => Math.max(1, Number(process.env.FARE_CHECKS_PER_DAY) || 3);
const FLEX_EVERY = 20 * HOUR;

type Key = Parameters<ReturnType<typeof translator>>[0];
const failIn = (language?: string) => (key: Key, vars?: Record<string, string | number>) =>
  new Error(translator(isLocale(language) ? language : defaultLocale)(key, vars));

async function userRow(ctx: QueryCtx | MutationCtx, userId: string) {
  return ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
    .unique();
}

const myWatch = (ctx: QueryCtx | MutationCtx, tripId: Id<"trips">, userId: string) =>
  ctx.db
    .query("fareWatches")
    .withIndex("by_tripId_userId", (q) => q.eq("tripId", tripId).eq("userId", userId))
    .unique();

/** Everything the trip page's Flights card needs, for the caller. */
export const forTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const [user, watch, bookings, members] = await Promise.all([
      userRow(ctx, userId),
      myWatch(ctx, tripId, userId),
      ctx.db.query("bookings").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      listMembers(ctx, trip),
    ]);
    const flights = bookings.filter((b) => b.kind === "flight");
    return {
      enabled: faresOn(),
      isOwner: trip.userId === userId,
      homeAirport: user?.homeAirport,
      suggestedTo: guessAirport(trip.destination),
      currency: watch?.currency ?? user?.homeCurrency ?? "USD",
      travelers: members.length,
      startDate: trip.startDate,
      endDate: trip.endDate,
      /** I've added a flight myself: no need to offer a fare watch. */
      iHaveFlight: flights.some((b) => b.addedBy === userId),
      /** Bookings with dates stop the trip from being moved to other dates. */
      hasBookings: bookings.length > 0,
      flights: flights.map((b) => ({ _id: b._id, title: b.title, startDate: b.startDate, startTime: b.startTime, endDate: b.endDate, endTime: b.endTime })),
      watch: watch && (({ _creationTime, ...w }) => ({ ...w, history: w.history.slice(-30), bookUrl: w.googleUrl ?? googleFlightsUrl(w.from, w.to, w.outboundDate, w.returnDate, w.adults, w.currency) }))(watch),
    };
  },
});

/** Starts or changes the caller's fare watch for the trip's dates. */
export const watch = mutation({
  args: {
    tripId: v.id("trips"),
    from: v.string(),
    to: v.string(),
    roundTrip: v.boolean(),
    adults: v.number(),
    /** Alert once the fare is at or below this, in cents. Leave out for "any real drop". */
    targetCents: v.optional(v.number()),
    /** Prices in this currency; defaults to the traveler's home currency. */
    currency: v.optional(v.string()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const fail = failIn(args.language);
    const { trip, userId } = await getMemberTrip(ctx, args.tripId);
    const from = args.from.trim().toUpperCase();
    const to = args.to.trim().toUpperCase();
    if (!isAirportCode(from) || !isAirportCode(to) || from === to) throw fail("alerts.errAirports");
    const today = isoDay(Date.now());
    if (trip.startDate < today) throw fail("fares.errStarted");
    const adults = Math.min(9, Math.max(1, Math.round(args.adults)));
    const targetCents = args.targetCents !== undefined && args.targetCents > 0 ? Math.round(args.targetCents) : undefined;
    const user = await userRow(ctx, userId);
    const currency = (args.currency && /^[A-Z]{3}$/.test(args.currency) ? args.currency : undefined) ?? user?.homeCurrency ?? "USD";

    // Remember the airport for their next trip.
    if (user) {
      if (user.homeAirport !== from) await ctx.db.patch("users", user._id, { homeAirport: from });
    } else await ctx.db.insert("users", { clerkId: userId, homeAirport: from });

    const fields = { from, to, outboundDate: trip.startDate, returnDate: args.roundTrip ? trip.endDate : undefined, adults, currency, targetCents };
    const existing = await myWatch(ctx, trip._id, userId);
    if (existing) {
      const reset =
        existing.from !== from ||
        existing.to !== to ||
        existing.outboundDate !== fields.outboundDate ||
        existing.returnDate !== fields.returnDate ||
        existing.adults !== adults ||
        existing.currency !== currency;
      await ctx.db.patch("fareWatches", existing._id, {
        ...fields,
        status: "active",
        // A new target is a new promise: tell them when it's met, even if we told them about a drop before.
        alertedCents: reset || existing.targetCents !== targetCents ? undefined : existing.alertedCents,
        ...(reset ? emptyPrices : {}),
      });
      if (!reset && existing.status === "active") return existing._id;
      if (faresOn()) await ctx.scheduler.runAfter(0, internal.fares.checkFare, { watchId: existing._id });
      return existing._id;
    }
    const watchId = await ctx.db.insert("fareWatches", { tripId: trip._id, userId, ...fields, history: [], offers: [], checks: 0, status: "active" });
    if (faresOn()) await ctx.scheduler.runAfter(0, internal.fares.checkFare, { watchId });
    return watchId;
  },
});

const emptyPrices = {
  firstCents: undefined,
  lastCents: undefined,
  lowestCents: undefined,
  alertedCents: undefined,
  history: [],
  insights: undefined,
  offers: [],
  flex: undefined,
  flexStatus: undefined,
  googleUrl: undefined,
  lastCheckedAt: undefined,
  error: undefined,
};

export const stop = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const { userId } = await getMemberTrip(ctx, tripId);
    const watch = await myWatch(ctx, tripId, userId);
    if (watch) await ctx.db.delete("fareWatches", watch._id);
  },
});

/** They tapped "Book": the apps ask "Booked it?" when they come back. */
export const bookStarted = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const { userId } = await getMemberTrip(ctx, tripId);
    const watch = await myWatch(ctx, tripId, userId);
    if (watch) await ctx.db.patch("fareWatches", watch._id, { bookStartedAt: Date.now() });
  },
});

/** "Not yet": back to watching, without the "Booked it?" prompt. */
export const notBookedYet = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const { userId } = await getMemberTrip(ctx, tripId);
    const watch = await myWatch(ctx, tripId, userId);
    if (watch) await ctx.db.patch("fareWatches", watch._id, { bookStartedAt: undefined });
  },
});

/** The traveler added a flight to the trip (booking import): their fare watch is done. */
export async function markFareBooked(ctx: MutationCtx, tripId: Id<"trips">, userId: string) {
  const watch = await myWatch(ctx, tripId, userId);
  if (watch && watch.status === "active") await ctx.db.patch("fareWatches", watch._id, { status: "booked", bookStartedAt: undefined });
}

export async function deleteTripFares(ctx: MutationCtx, tripId: Id<"trips">) {
  const rows = await ctx.db.query("fareWatches").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect();
  await Promise.all(rows.map((r) => ctx.db.delete("fareWatches", r._id)));
}

// ---------- Nearby dates ----------

/** Looks up the trip moved by up to 3 days either way. At most once a day per watch. */
export const checkNearbyDates = mutation({
  args: { tripId: v.id("trips"), language: v.optional(v.string()) },
  handler: async (ctx, { tripId, language }) => {
    const fail = failIn(language);
    const { userId } = await getMemberTrip(ctx, tripId);
    const watch = await myWatch(ctx, tripId, userId);
    if (!watch || watch.status !== "active") throw fail("fares.errNoWatch");
    if (!faresOn()) throw fail("fares.off");
    if (watch.flexStatus === "checking") return;
    if (watch.flex && watch.flex.outboundDate === watch.outboundDate && Date.now() - watch.flex.checkedAt < FLEX_EVERY) return;
    await ctx.db.patch("fareWatches", watch._id, { flexStatus: "checking" });
    await ctx.scheduler.runAfter(0, internal.fares.checkFlex, { watchId: watch._id });
  },
});

export const checkFlex = internalAction({
  args: { watchId: v.id("fareWatches") },
  handler: async (ctx, { watchId }): Promise<void> => {
    const watch = await ctx.runQuery(internal.fares.fareJob, { watchId });
    if (!watch) return;
    const today = isoDay(Date.now());
    const cells: FlexCell[] = [];
    try {
      for (const shiftDays of FLEX_SHIFTS) {
        const outboundDate = shiftDate(watch.outboundDate, shiftDays);
        const returnDate = watch.returnDate ? shiftDate(watch.returnDate, shiftDays) : undefined;
        if (outboundDate <= today) {
          cells.push({ shiftDays, outboundDate, returnDate });
          continue;
        }
        // Today's check already covers the trip's own dates.
        if (shiftDays === 0 && watch.lastCents !== undefined && watch.lastCheckedAt && Date.now() - watch.lastCheckedAt < FLEX_EVERY) {
          cells.push({ shiftDays, outboundDate, returnDate, cents: watch.lastCents });
          continue;
        }
        const found = isDemo() ? { cents: demoFare(watch._id, watch.checks, shiftDays) } : await searchFares({ ...watch, outboundDate, returnDate });
        cells.push({ shiftDays, outboundDate, returnDate, cents: found?.cents });
      }
      await ctx.runMutation(internal.fares.recordFlex, { watchId, outboundDate: watch.outboundDate, cells });
    } catch (error) {
      console.warn("Nearby dates check failed", error);
      await ctx.runMutation(internal.fares.recordFlex, { watchId, outboundDate: watch.outboundDate, failed: true });
    }
  },
});

export const recordFlex = internalMutation({
  args: { watchId: v.id("fareWatches"), outboundDate: v.string(), cells: v.optional(v.array(flexCell)), failed: v.optional(v.boolean()) },
  handler: async (ctx, { watchId, outboundDate, cells, failed }) => {
    const watch = await ctx.db.get("fareWatches", watchId);
    if (!watch) return;
    if (failed || !cells) return await ctx.db.patch("fareWatches", watchId, { flexStatus: "failed" });
    // The trip moved while we were looking: these prices are for the old dates.
    if (watch.outboundDate !== outboundDate) return await ctx.db.patch("fareWatches", watchId, { flexStatus: undefined });
    await ctx.db.patch("fareWatches", watchId, { flex: { checkedAt: Date.now(), outboundDate, cells }, flexStatus: undefined });
  },
});

/**
 * Moves the whole trip (its dates and each day's date) by `days`, for a cheaper
 * flight from the nearby-dates grid. Organizer only, and only while nothing is
 * booked, since reservations wouldn't move with it. Fare watches follow the trip.
 */
export const moveTrip = mutation({
  args: { tripId: v.id("trips"), days: v.number(), language: v.optional(v.string()) },
  handler: async (ctx, { tripId, days, language }) => {
    const fail = failIn(language);
    const trip = await getOwnedTrip(ctx, tripId);
    const shift = Math.round(days);
    if (shift === 0) return;
    if (Math.abs(shift) > 14) throw fail("fares.errMoveFar");
    const startDate = shiftDate(trip.startDate, shift);
    if (startDate <= isoDay(Date.now())) throw fail("fares.errStarted");
    const booking = await ctx.db.query("bookings").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).first();
    if (booking) throw fail("fares.errHasBookings");

    await ctx.db.patch("trips", tripId, { startDate, endDate: shiftDate(trip.endDate, shift) });
    const days_ = await ctx.db.query("subTrips").withIndex("by_tripId_order", (q) => q.eq("tripId", tripId)).collect();
    await Promise.all(days_.flatMap((d) => (d.date ? [ctx.db.patch("subTrips", d._id, { date: shiftDate(d.date, shift) })] : [])));

    for (const w of await ctx.db.query("fareWatches").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect()) {
      if (w.status !== "active") continue;
      const outboundDate = shiftDate(w.outboundDate, shift);
      // The grid stays useful: the same cells, now counted from the new dates.
      const flex = w.flex && w.flex.outboundDate === w.outboundDate ? { ...w.flex, outboundDate, cells: w.flex.cells.map((c) => ({ ...c, shiftDays: c.shiftDays - shift })).filter((c) => Math.abs(c.shiftDays) <= 3) } : undefined;
      await ctx.db.patch("fareWatches", w._id, {
        ...emptyPrices,
        outboundDate,
        returnDate: w.returnDate ? shiftDate(w.returnDate, shift) : undefined,
        flex,
        status: "active",
      });
      if (faresOn()) await ctx.scheduler.runAfter(0, internal.fares.checkFare, { watchId: w._id });
    }
  },
});

// ---------- Daily check ----------

export const dueFares = internalQuery({
  args: { now: v.number(), limit: v.number() },
  handler: async (ctx, { now, limit }) => {
    const rows = await ctx.db
      .query("fareWatches")
      .withIndex("by_status_lastCheckedAt", (q) => q.eq("status", "active").lt("lastCheckedAt", now - 20 * HOUR))
      .take(limit);
    return rows.map((r) => r._id);
  },
});

/** Once a day (crons.ts). */
export const checkAll = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    if (!faresOn()) return;
    const ids = await ctx.runQuery(internal.fares.dueFares, { now: Date.now(), limit: checksPerDay() });
    for (const watchId of ids) await ctx.runAction(internal.fares.checkFare, { watchId });
  },
});

export const fareJob = internalQuery({
  args: { watchId: v.id("fareWatches") },
  handler: async (ctx, { watchId }) => {
    const watch = await ctx.db.get("fareWatches", watchId);
    return watch && watch.status === "active" ? watch : null;
  },
});

export const checkFare = internalAction({
  args: { watchId: v.id("fareWatches") },
  handler: async (ctx, { watchId }): Promise<void> => {
    const watch = await ctx.runQuery(internal.fares.fareJob, { watchId });
    if (!watch) return;
    const now = Date.now();
    if (watch.outboundDate <= isoDay(now)) {
      await ctx.runMutation(internal.fares.recordFare, { watchId, now, ended: true });
      return;
    }
    try {
      let found: Awaited<ReturnType<typeof searchFares>>;
      if (isDemo()) {
        const cents = demoFare(watch._id, watch.checks);
        found = { cents, offers: demoOffers(cents, watch.from, watch.to, watch.outboundDate), insights: demoInsights(cents, now) };
      } else found = await searchFares(watch);
      await ctx.runMutation(internal.fares.recordFare, { watchId, now, ...(found ?? { error: "noResults" }) });
    } catch (error) {
      console.warn("Fare check failed", error);
      await ctx.runMutation(internal.fares.recordFare, { watchId, now, error: "failed" });
    }
  },
});

type Search = Pick<Doc<"fareWatches">, "from" | "to" | "outboundDate" | "returnDate" | "adults" | "currency">;

async function searchFares(w: Search): Promise<{ cents: number; offers: FareOffer[]; insights?: FareInsights; googleUrl?: string } | null> {
  const key = serpKey();
  if (!key) return null;
  const params = new URLSearchParams({
    engine: "google_flights",
    api_key: key,
    departure_id: w.from,
    arrival_id: w.to,
    outbound_date: w.outboundDate,
    type: w.returnDate ? "1" : "2",
    currency: w.currency,
    hl: "en",
    adults: String(w.adults),
  });
  if (w.returnDate) params.set("return_date", w.returnDate);
  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) throw new Error(`SerpApi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parseFares((await res.json()) as SerpFareResponse);
}

export const recordFare = internalMutation({
  args: {
    watchId: v.id("fareWatches"),
    now: v.number(),
    cents: v.optional(v.number()),
    offers: v.optional(v.array(fareOffer)),
    insights: v.optional(fareInsights),
    googleUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    ended: v.optional(v.boolean()),
  },
  handler: async (ctx, { watchId, now, cents, offers, insights, googleUrl, error, ended }) => {
    const watch = await ctx.db.get("fareWatches", watchId);
    if (!watch || watch.status !== "active") return;
    if (ended) return await ctx.db.patch("fareWatches", watchId, { status: "ended", lastCheckedAt: now });
    if (cents === undefined) return await ctx.db.patch("fareWatches", watchId, { lastCheckedAt: now, checks: watch.checks + 1, error });

    const alert = fareAlert(watch, cents);
    // Back above the target: the next time it gets there is news again.
    const forget = watch.targetCents !== undefined && cents > watch.targetCents;
    await ctx.db.patch("fareWatches", watchId, {
      lastCheckedAt: now,
      checks: watch.checks + 1,
      error: undefined,
      firstCents: watch.firstCents ?? cents,
      lastCents: cents,
      lowestCents: Math.min(cents, watch.lowestCents ?? cents),
      history: [...watch.history, { at: now, cents }].slice(-60),
      offers: offers ?? watch.offers,
      insights: insights ?? watch.insights,
      googleUrl: googleUrl ?? watch.googleUrl,
      ...(alert ? { alertedCents: cents } : forget ? { alertedCents: undefined } : {}),
    });
    if (!alert) return;
    const trip = await ctx.db.get("trips", watch.tripId);
    if (!trip) return;
    await notify(ctx, trip, {
      kind: alert.kind === "target" ? "fareTarget" : "fareDrop",
      params: { title: `${watch.from} → ${watch.to}`, amountCents: cents, wasCents: alert.wasCents, currency: watch.currency },
      to: [watch.userId],
    });
  },
});
