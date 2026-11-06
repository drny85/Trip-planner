import { v } from "convex/values";
import { defaultLocale, isLocale, translator } from "@trip/i18n";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
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
import { affiliateUrl, aviasalesUrl, insightsFromGrid, nearestOffers, onDates, parseTp, TP_API, tpOffers, tpParams, type TpResponse } from "./lib/travelpayouts";
import { notify } from "./lib/notify";

/**
 * Fare watch: for travelers who haven't booked a flight yet.
 *
 * 1. They pick their home airport (remembered) and the destination airport
 *    (guessed from the trip). We look up the cheapest fare for the trip's dates
 *    right away, then once a day (crons.ts), so the apps can say whether it's a
 *    good time to book.
 * 2. Only they get a push when the fare drops, or reaches the price they set.
 * 3. "Nearby dates": the same trip moved by up to 3 days either way, and the
 *    organizer can move the whole trip to a cheaper window.
 * 4. "Book" opens Aviasales (an affiliate link) or Google Flights. Once their
 *    flight booking is added (booking import), the watch is done and live
 *    flight tracking (alerts.ts) takes over.
 *
 * Where prices come from, first configured wins:
 * - TRAVELPAYOUTS_TOKEN: Travelpayouts' free Aviasales Data API (fares Aviasales
 *   users found in the last 48 hours). Every search is cached in `fareCache`
 *   and shared by everyone watching the same route and dates, so each runs at
 *   most once a day, and the nearby-dates grid comes with the daily check.
 *   TRAVELPAYOUTS_MARKER makes the Book link an affiliate link.
 * - SERPAPI_API_KEY alone: Google Flights through SerpApi, as before
 *   (FARE_CHECKS_PER_DAY, default 3; the nearby-dates grid costs 6 searches).
 * With Travelpayouts on, SerpApi is used only for one live Google Flights check
 * when someone taps Book, at most LIVE_FARE_CHECKS_PER_DAY (default 2) a day.
 * ALERTS_DEMO=true makes up fares.
 */

type Provider = "travelpayouts" | "google" | "demo";
const serpKey = () => process.env.SERPAPI_API_KEY;
const tpToken = () => process.env.TRAVELPAYOUTS_TOKEN;
const isDemo = () => process.env.ALERTS_DEMO === "true";
const provider = (): Provider | null => (tpToken() ? "travelpayouts" : serpKey() ? "google" : isDemo() ? "demo" : null);
const faresOn = () => provider() !== null;
const checksPerDay = () => Math.max(1, Number(process.env.FARE_CHECKS_PER_DAY) || (provider() === "travelpayouts" ? 200 : 3));
const liveChecksPerDay = () => Math.max(0, Number(process.env.LIVE_FARE_CHECKS_PER_DAY ?? 2) || 0);
const FLEX_EVERY = 20 * HOUR;
const CACHE_FOR = 20 * HOUR;

/** Where "Book" goes for a watch. */
function bookLink(w: Pick<Doc<"fareWatches">, "from" | "to" | "outboundDate" | "returnDate" | "adults" | "currency" | "googleUrl">) {
  if (tpToken()) return { site: "Aviasales", url: affiliateUrl(aviasalesUrl(w.from, w.to, w.outboundDate, w.returnDate, w.adults), process.env.TRAVELPAYOUTS_MARKER) };
  return { site: "Google Flights", url: w.googleUrl ?? googleFlightsUrl(w.from, w.to, w.outboundDate, w.returnDate, w.adults, w.currency) };
}

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
      watch: watch && (({ _creationTime, ...w }) => {
        const book = bookLink(w);
        return { ...w, history: w.history.slice(-30), bookUrl: book.url, bookSite: book.site };
      })(watch),
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
    if (!watch) return;
    const now = Date.now();
    await ctx.db.patch("fareWatches", watch._id, { bookStartedAt: now });
    // Cached fares can be hours old: one live look while they book, when the budget allows.
    if (provider() !== "travelpayouts" || !serpKey() || watch.status !== "active") return;
    if (watch.liveCheckedAt && now - watch.liveCheckedAt < 24 * HOUR) return;
    const today = await ctx.db
      .query("fareWatches")
      .withIndex("by_liveCheckedAt", (q) => q.gt("liveCheckedAt", now - 24 * HOUR))
      .take(liveChecksPerDay());
    if (today.length >= liveChecksPerDay()) return;
    await ctx.db.patch("fareWatches", watch._id, { liveCheckedAt: now });
    await ctx.scheduler.runAfter(0, internal.fares.liveCheck, { watchId: watch._id });
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
    // With Travelpayouts the grid comes with the regular (cached) check.
    await ctx.scheduler.runAfter(0, provider() === "travelpayouts" ? internal.fares.checkFare : internal.fares.checkFlex, { watchId: watch._id });
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
    if (provider() === "travelpayouts") return await checkViaTravelpayouts(ctx, watch, now);
    try {
      let found: Awaited<ReturnType<typeof searchFares>>;
      if (provider() === "demo") {
        const cents = demoFare(watch._id, watch.checks);
        found = { cents, offers: demoOffers(cents, watch.from, watch.to, watch.outboundDate), insights: demoInsights(cents, now) };
      } else found = await searchFares(watch);
      await ctx.runMutation(internal.fares.recordFare, { watchId, now, source: provider() === "demo" ? "demo" : "google", ...(found ?? { error: "noResults" }) });
    } catch (error) {
      console.warn("Fare check failed", error);
      await ctx.runMutation(internal.fares.recordFare, { watchId, now, error: "failed" });
    }
  },
});

// ---------- Travelpayouts, with the shared cache ----------

const cacheKey = (from: string, to: string, outboundDate: string, returnDate: string | undefined, currency: string) =>
  `tp:${from}:${to}:${outboundDate}:${returnDate ?? "-"}:${currency}`;

export const cachedFares = internalQuery({
  args: { keys: v.array(v.string()), since: v.number() },
  handler: async (ctx, { keys, since }) => {
    const rows = await Promise.all(keys.map((key) => ctx.db.query("fareCache").withIndex("by_key", (q) => q.eq("key", key)).unique()));
    return rows.filter((r) => r !== null && r.fetchedAt >= since).map((r) => ({ key: r!.key, cents: r!.cents, offers: r!.offers }));
  },
});

export const storeFares = internalMutation({
  args: { entries: v.array(v.object({ key: v.string(), cents: v.optional(v.number()), offers: v.array(fareOffer) })), now: v.number() },
  handler: async (ctx, { entries, now }) => {
    for (const e of entries) {
      const row = await ctx.db.query("fareCache").withIndex("by_key", (q) => q.eq("key", e.key)).unique();
      if (row) await ctx.db.patch("fareCache", row._id, { ...e, fetchedAt: now });
      else await ctx.db.insert("fareCache", { ...e, fetchedAt: now });
    }
  },
});

/** Clears cache rows for dates that have passed (crons.ts, daily). */
export const pruneFareCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("fareCache")
      .filter((q) => q.lt(q.field("fetchedAt"), Date.now() - 3 * 24 * HOUR))
      .take(500);
    await Promise.all(old.map((r) => ctx.db.delete("fareCache", r._id)));
  },
});

type CacheEntry = { key: string; cents?: number; offers: FareOffer[] };

/** One Travelpayouts search, prices per passenger. */
async function tpSearch(w: { from: string; to: string; currency: string }, outboundDate: string, returnDate: string | undefined) {
  const res = await fetch(`${TP_API}?${tpParams({ ...w, outboundDate, returnDate }, process.env.TRAVELPAYOUTS_MARKET ?? "us")}`, {
    headers: { "X-Access-Token": tpToken()!, "Accept-Encoding": "gzip, deflate" },
  });
  if (!res.ok) throw new Error(`Travelpayouts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as TpResponse;
}

/**
 * Today's fare and the ±3 day grid for one watch. Each of the 7 searches is
 * read from the shared cache when someone looked it up in the last 20 hours,
 * and fetched (free) otherwise. Prices are cached per passenger and scaled here.
 *
 * Exact-date searches are often empty (Travelpayouts only has what Aviasales
 * users searched lately), so when any day is missing we also search the whole
 * month, fill the grid from it and, if the trip's own dates have nothing, show
 * the fares closest to them.
 */
async function checkViaTravelpayouts(ctx: ActionCtx, watch: Doc<"fareWatches">, now: number) {
  const today = isoDay(now);
  const cells = FLEX_SHIFTS.map((shiftDays) => {
    const outboundDate = shiftDate(watch.outboundDate, shiftDays);
    const returnDate = watch.returnDate ? shiftDate(watch.returnDate, shiftDays) : undefined;
    return { shiftDays, outboundDate, returnDate, key: cacheKey(watch.from, watch.to, outboundDate, returnDate, watch.currency), past: outboundDate <= today };
  });
  const outMonth = watch.outboundDate.slice(0, 7);
  const retMonth = watch.returnDate?.slice(0, 7);
  const monthKey = cacheKey(watch.from, watch.to, outMonth, retMonth, watch.currency);
  try {
    const keys = [...cells.filter((c) => !c.past).map((c) => c.key), monthKey];
    const fresh: CacheEntry[] = await ctx.runQuery(internal.fares.cachedFares, { keys, since: now - CACHE_FOR });
    const byKey = new Map<string, CacheEntry>(fresh.map((e) => [e.key, e]));
    const fetched: CacheEntry[] = [];
    for (const c of cells) {
      if (c.past || byKey.has(c.key)) continue;
      const found = parseTp(await tpSearch(watch, c.outboundDate, c.returnDate), { outboundDate: c.outboundDate, returnDate: c.returnDate, adults: 1 });
      const entry = { key: c.key, cents: found?.cents, offers: found?.offers ?? [] };
      fetched.push(entry);
      byKey.set(c.key, entry);
    }
    let month: FareOffer[] = [];
    if (cells.some((c) => !c.past && byKey.get(c.key)?.cents === undefined)) {
      let entry = byKey.get(monthKey);
      if (!entry) {
        const offers = tpOffers(await tpSearch(watch, outMonth, retMonth), 1).slice(0, 60);
        entry = { key: monthKey, cents: offers[0]?.cents, offers };
        fetched.push(entry);
      }
      month = entry.offers;
    }
    if (fetched.length) await ctx.runMutation(internal.fares.storeFares, { entries: fetched, now });

    const scale = (cents?: number) => (cents === undefined ? undefined : cents * watch.adults);
    const cheapestOn = (c: (typeof cells)[number]) => byKey.get(c.key)?.cents ?? onDates(month, c.outboundDate, c.returnDate)[0]?.cents;
    const flex = cells.map((c) => ({ shiftDays: c.shiftDays, outboundDate: c.outboundDate, returnDate: c.returnDate, cents: c.past ? undefined : scale(cheapestOn(c)) }));
    const mine = cells[3]!;
    const exact = byKey.get(mine.key)?.cents !== undefined ? byKey.get(mine.key)!.offers : onDates(month, mine.outboundDate, mine.returnDate).slice(0, 3);
    const offers = (exact.length ? exact : nearestOffers(month, mine.outboundDate, mine.returnDate)).map((o) => ({ ...o, cents: o.cents * watch.adults }));
    const cents = offers.length ? Math.min(...offers.map((o) => o.cents)) : undefined;
    await ctx.runMutation(internal.fares.recordFare, {
      watchId: watch._id,
      now,
      source: "travelpayouts",
      flex,
      ...(cents === undefined
        ? { error: "noResults" }
        : { cents, offers, insights: insightsFromGrid(cents, flex.filter((c) => c.shiftDays !== 0).map((c) => c.cents)) }),
    });
  } catch (error) {
    console.warn("Travelpayouts fare check failed", error);
    await ctx.runMutation(internal.fares.recordFare, { watchId: watch._id, now, error: "failed" });
  }
}

/** One live Google Flights look (SerpApi) while they book; quiet, it's only to show today's real price. */
export const liveCheck = internalAction({
  args: { watchId: v.id("fareWatches") },
  handler: async (ctx, { watchId }): Promise<void> => {
    const watch = await ctx.runQuery(internal.fares.fareJob, { watchId });
    if (!watch) return;
    try {
      const found = await searchFares(watch);
      if (found) await ctx.runMutation(internal.fares.recordFare, { watchId, now: Date.now(), source: "google", quiet: true, ...found });
    } catch (error) {
      console.warn("Live fare check failed", error);
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
    source: v.optional(v.union(v.literal("travelpayouts"), v.literal("google"), v.literal("demo"))),
    /** The ±3 day grid, when the check brought one (Travelpayouts). */
    flex: v.optional(v.array(flexCell)),
    /** Record the price without a push (the live check while they book). */
    quiet: v.optional(v.boolean()),
  },
  handler: async (ctx, { watchId, now, cents, offers, insights, googleUrl, error, ended, source, flex, quiet }) => {
    const watch = await ctx.db.get("fareWatches", watchId);
    if (!watch || watch.status !== "active") return;
    if (ended) return await ctx.db.patch("fareWatches", watchId, { status: "ended", lastCheckedAt: now });
    const grid = flex ? { flex: { checkedAt: now, outboundDate: watch.outboundDate, cells: flex }, flexStatus: undefined } : {};
    // A new price source: the old one's prices, options and trend don't carry over
    // (a quiet live check while booking is a one-off look, not a switch).
    const switched = !quiet && source !== undefined && source !== (watch.source ?? "google");
    const reset = switched
      ? { firstCents: undefined, lastCents: undefined, lowestCents: undefined, history: [], offers: [], insights: undefined, googleUrl: undefined, alertedCents: undefined }
      : {};
    const base = { ...watch, ...reset };
    if (cents === undefined)
      return await ctx.db.patch("fareWatches", watchId, {
        lastCheckedAt: now,
        checks: watch.checks + 1,
        error,
        ...reset,
        ...(switched ? { source } : {}),
        ...grid,
        ...(flex ? {} : error === "failed" && watch.flexStatus === "checking" ? { flexStatus: "failed" as const } : {}),
      });

    if (quiet) {
      // The live look while they book shows today's real price and options, but
      // leaves the trend, first and lowest price to the daily checks.
      return await ctx.db.patch("fareWatches", watchId, { lastCents: cents, offers: offers ?? watch.offers, insights: insights ?? watch.insights, googleUrl: googleUrl ?? watch.googleUrl, error: undefined });
    }

    const alert = switched ? null : fareAlert(watch, cents);
    // Back above the target: the next time it gets there is news again.
    const forget = watch.targetCents !== undefined && cents > watch.targetCents;
    await ctx.db.patch("fareWatches", watchId, {
      ...reset,
      lastCheckedAt: now,
      checks: watch.checks + 1,
      error: undefined,
      firstCents: base.firstCents ?? cents,
      lastCents: cents,
      lowestCents: Math.min(cents, base.lowestCents ?? cents),
      history: [...base.history, { at: now, cents }].slice(-60),
      offers: offers ?? base.offers,
      insights: switched ? insights : (insights ?? watch.insights),
      googleUrl: googleUrl ?? base.googleUrl,
      source: source ?? watch.source,
      ...grid,
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
