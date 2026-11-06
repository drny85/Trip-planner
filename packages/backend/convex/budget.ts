import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { findMembership, getOptionalUserId } from "./lib/auth";
import { guessCategory, type OverviewExtras } from "./lib/budgetOverview";
import { listMembers } from "./lib/members";
import { shares, toGroupCurrency, type Split } from "./lib/settle";

/** The local date ("YYYY-MM-DD") of a moment where the trip happens. */
function localDate(ms: number, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

const splitOf = (e: Doc<"expenses">): Split => ({ mode: e.splitMode ?? "equal", people: e.splitAmong, values: e.splitValues });

/**
 * Everything on a trip that costs money besides the itinerary, for the budget
 * overview (lib/budgetOverview.ts does the math in the apps):
 * shared expenses with the caller's share, priced bookings, and fare watches for
 * flights nobody has booked yet. Members only; null otherwise.
 */
export const overview = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const [members, expenseRows, bookingRows, watches, fareRows, me] = await Promise.all([
      listMembers(ctx, trip),
      ctx.db.query("expenses").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("bookings").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("priceWatches").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("fareWatches").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", userId)).unique(),
    ]);
    const tripCurrency = trip.currency ?? "USD";
    const groupCurrency = trip.groupCurrency ?? tripCurrency;

    const expenses: OverviewExtras["expenses"] = expenseRows
      .filter((e) => !e.isSettlement)
      .map((e) => {
        const group = toGroupCurrency(e.amountCents, splitOf(e), e.rate ?? 1);
        return {
          _id: e._id,
          description: e.description,
          category: e.category ?? guessCategory(e.description),
          date: localDate(e._creationTime, trip.timeZone),
          currency: groupCurrency,
          totalCents: group.amountCents,
          myShareCents: shares(group.amountCents, group.split).find(([who]) => who === userId)?.[1] ?? 0,
        };
      });

    const watchOf = new Map(watches.map((w) => [w.bookingId as string, w]));
    const bookings: OverviewExtras["bookings"] = bookingRows.flatMap((b) => {
      const watch = watchOf.get(b._id);
      const cents = b.priceCents ?? watch?.paidCents;
      const currency = b.priceCents != null ? b.priceCurrency : watch?.currency;
      if (!cents || !currency) return [];
      return [{ _id: b._id, kind: b.kind, title: b.title, activityId: b.activityId, date: b.startDate, cents, currency, people: watch?.adults ?? members.length }];
    });

    const fares: OverviewExtras["fares"] = fareRows
      .filter((f) => f.status === "active" && f.lastCents)
      .map((f) => ({ _id: f._id, isMine: f.userId === userId, date: f.outboundDate, cents: f.lastCents!, currency: f.currency, people: f.adults }));

    return {
      travelers: Math.max(1, members.length),
      tripCurrency,
      groupCurrency,
      homeCurrency: me?.homeCurrency ?? null,
      expenses,
      bookings,
      fares,
    };
  },
});
