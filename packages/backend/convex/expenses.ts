import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { findMembership, getCallerProfile, getMemberTrip, getOptionalUserId } from "./lib/auth";
import { listMembers } from "./lib/members";
import { notify } from "./lib/notify";
import { checkSplit, ledger, maxPayment, settleUp, shares, type Expense, type Payment, type Split, type SplitError, type SplitMode, toGroupCurrency } from "./lib/settle";
import { activityCategory, splitInput } from "./lib/validators";
import { guessCategory } from "./lib/budgetOverview";

/**
 * Shared costs on a trip: expenses (who paid, and how it's split) and payments
 * (who paid whom back). `forTrip` returns everything the apps need already worked
 * out, so both screens stay simple. The math is in lib/settle.ts.
 *
 * Currencies: each expense keeps the currency it was paid in and a rate into the
 * trip's one group currency, fixed when it was logged. Balances and payments are in
 * the group currency, so everyone settles up in one money.
 *
 * Errors are `ConvexError({ code })`; the apps translate the code (split.errors.*).
 */

const MAX_CENTS = 100_000_000;
export type ExpenseErrorCode =
  | "badAmount"
  | "notOnTrip"
  | "notAllowed"
  | "nothingOwed"
  | "tooMuch"
  | "badCurrency"
  | "needRate"
  | SplitError;
const fail = (code: ExpenseErrorCode): never => {
  throw new ConvexError({ code });
};

/** A stored row as the split it describes. Old rows have no mode, so they're equal splits. */
function splitOf(e: Doc<"expenses">): Split {
  return { mode: e.splitMode ?? "equal", people: e.splitAmong, values: e.splitValues };
}

const isCode = (c: string) => /^[A-Z]{3}$/.test(c);

/** The currency an expense was paid in. Rows from before currencies were in the trip's. */
const currencyOf = (e: Doc<"expenses">, trip: Doc<"trips">) => e.currency ?? trip.currency ?? "USD";

async function homeCurrencyOf(ctx: QueryCtx | MutationCtx, userId: string) {
  const row = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", userId)).unique();
  return row?.homeCurrency ?? null;
}

/**
 * The trip's group currency. Until it's pinned (on the first expense) it's the
 * organizer's home currency, or the trip's currency for trips with older expenses.
 */
async function groupCurrencyOf(ctx: QueryCtx | MutationCtx, trip: Doc<"trips">, hasOldExpenses: boolean) {
  if (trip.groupCurrency) return trip.groupCurrency;
  if (hasOldExpenses) return trip.currency ?? "USD";
  return (await homeCurrencyOf(ctx, trip.userId)) ?? trip.currency ?? "USD";
}

/** An expense as it counts toward balances, in the group currency. */
const inGroup = (e: Doc<"expenses">) => toGroupCurrency(e.amountCents, splitOf(e), e.rate ?? 1);

async function loadLedger(ctx: QueryCtx | MutationCtx, tripId: Id<"trips">) {
  const [expenseRows, settlementRows] = await Promise.all([
    ctx.db.query("expenses").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
    ctx.db.query("settlements").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
  ]);
  // Before the settlements table, a payment was an expense flagged isSettlement.
  const legacy = expenseRows.filter((e) => e.isSettlement);
  const expenses = expenseRows.filter((e) => !e.isSettlement);
  const payments = [
    ...settlementRows.map((s) => ({ _id: s._id as Id<"settlements"> | Id<"expenses">, _creationTime: s._creationTime, from: s.from, to: s.to, amountCents: s.amountCents, createdBy: s.createdBy })),
    ...legacy.map((e) => ({ _id: e._id as Id<"settlements"> | Id<"expenses">, _creationTime: e._creationTime, from: e.paidBy, to: e.splitAmong[0] ?? "", amountCents: e.amountCents, createdBy: e.createdBy })),
  ];
  const totals = ledger(
    expenses.map((e): Expense => ({ paidBy: e.paidBy, ...inGroup(e) })),
    payments.map((p): Payment => p),
  );
  return { expenses, payments, totals, net: new Map([...totals].map(([who, t]) => [who, t.netCents])) };
}

export const forTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const [{ expenses, payments, totals, net }, members, homeCurrency] = await Promise.all([loadLedger(ctx, tripId), listMembers(ctx, trip), homeCurrencyOf(ctx, userId)]);
    const groupCurrency = await groupCurrencyOf(ctx, trip, expenses.some((e) => !e.currency));
    const isOrganizer = trip.userId === userId;

    // Everyone on the trip, plus anyone who left but still appears in the ledger.
    const memberIds = new Set(members.map((m) => m.userId));
    const formerIds = [...totals.keys()].filter((id) => !memberIds.has(id));
    const zero = { paidCents: 0, shareCents: 0, sentCents: 0, receivedCents: 0, netCents: 0 };
    const people = [
      ...members.map((m) => ({ userId: m.userId, name: m.name as string | null, imageUrl: m.imageUrl ?? null, isMe: m.userId === userId, isMember: true })),
      ...formerIds.map((id) => ({ userId: id, name: null, imageUrl: null, isMe: false, isMember: false })),
    ].map((p) => ({ ...p, ...(totals.get(p.userId) ?? zero) }));

    const entries = [
      ...expenses.map((e) => {
        const split = splitOf(e);
        const group = inGroup(e);
        const parts = shares(group.amountCents, group.split);
        return {
          kind: "expense" as const,
          _id: e._id,
          _creationTime: e._creationTime,
          description: e.description,
          /** What was paid, in `currency`. */
          amountCents: e.amountCents,
          currency: currencyOf(e, trip),
          rate: e.rate ?? 1,
          /** What it was for; guessed from the description on rows logged before categories. */
          category: e.category ?? guessCategory(e.description),
          /** The same amount in the group currency. */
          groupCents: group.amountCents,
          paidBy: e.paidBy,
          mode: split.mode,
          /** Each person's share in group-currency cents, plus what was typed for non-equal splits. */
          shares: parts.map(([who, cents], i) => ({ userId: who, cents, value: split.values?.[i] ?? null })),
          myShareCents: parts.find(([who]) => who === userId)?.[1] ?? 0,
          canEdit: isOrganizer || e.createdBy === userId || e.paidBy === userId,
        };
      }),
      ...payments.map((p) => ({
        kind: "payment" as const,
        _id: p._id,
        _creationTime: p._creationTime,
        from: p.from,
        to: p.to,
        amountCents: p.amountCents,
        canEdit: isOrganizer || p.createdBy === userId || p.from === userId || p.to === userId,
      })),
    ].sort((a, b) => b._creationTime - a._creationTime);

    return {
      /** The group currency: balances, totals, shares and payments are all in it. */
      currency: groupCurrency,
      /** Where the caller travels from, if known. The expense form offers it first. */
      homeCurrency,
      /** The destination's currency. The expense form offers it second. */
      localCurrency: trip.currency ?? null,
      canChangeCurrency: isOrganizer,
      me: userId,
      people,
      entries,
      totalCents: expenses.reduce((s, e) => s + inGroup(e).amountCents, 0),
      myBalanceCents: net.get(userId) ?? 0,
      /** Suggested payments that settle everyone up. */
      transfers: settleUp(net).map((t) => ({ ...t, canRecord: isOrganizer || t.from === userId || t.to === userId })),
    };
  },
});

const expenseArgs = {
  description: v.string(),
  amountCents: v.number(),
  paidBy: v.string(),
  split: splitInput,
  /** What it was paid in. Defaults to the group currency. */
  currency: v.optional(v.string()),
  /** 1 unit of `currency` in the group currency. Required when they differ. */
  rate: v.optional(v.number()),
  /** What kind of cost it was (food, transport, …), for the budget overview. */
  category: v.optional(activityCategory),
};

/** Fixes the trip's group currency the first time it's needed, so later rates stay valid. */
async function pinGroupCurrency(ctx: MutationCtx, trip: Doc<"trips">) {
  if (trip.groupCurrency) return trip.groupCurrency;
  const rows = await ctx.db.query("expenses").withIndex("by_tripId", (q) => q.eq("tripId", trip._id)).collect();
  const group = await groupCurrencyOf(ctx, trip, rows.some((e) => !e.currency));
  await ctx.db.patch("trips", trip._id, { groupCurrency: group });
  return group;
}

/** Checks an expense against the trip's members and returns the cleaned-up fields. */
async function validate(ctx: MutationCtx, trip: Doc<"trips">, input: { description: string; amountCents: number; paidBy: string; split: Split; currency?: string; rate?: number; category?: Doc<"expenses">["category"] }) {
  const cents = Math.round(input.amountCents);
  if (!Number.isFinite(cents) || cents <= 0 || cents > MAX_CENTS) fail("badAmount");
  const members = new Set((await listMembers(ctx, trip)).map((m) => m.userId));
  const { people } = input.split;
  if (!members.has(input.paidBy) || people.some((p) => !members.has(p))) fail("notOnTrip");
  const mode: SplitMode = input.split.mode;
  const values = mode === "equal" ? undefined : input.split.values?.map((x) => Math.round(x));
  const problem = checkSplit(cents, { mode, people, values });
  if (problem) fail(problem);
  const group = await pinGroupCurrency(ctx, trip);
  const currency = input.currency ?? group;
  if (!isCode(currency)) fail("badCurrency");
  const rate = currency === group ? 1 : input.rate;
  if (rate == null || !Number.isFinite(rate) || rate <= 0 || rate > 1e6) fail("needRate");
  return {
    description: input.description.trim().slice(0, 80) || "Expense",
    currency,
    rate: rate!,
    amountCents: cents,
    paidBy: input.paidBy,
    splitAmong: people,
    splitMode: mode,
    splitValues: values,
    category: input.category,
  };
}

export const add = mutation({
  args: { tripId: v.id("trips"), ...expenseArgs },
  handler: async (ctx, { tripId, ...input }) => {
    const { trip, userId } = await getMemberTrip(ctx, tripId);
    const fields = await validate(ctx, trip, input);
    const id = await ctx.db.insert("expenses", { tripId, ...fields, createdBy: userId });
    const { name } = await getCallerProfile(ctx);
    await notify(ctx, trip, {
      kind: "expense",
      actorId: userId,
      to: fields.splitAmong,
      params: { name: name.split(" ")[0], item: fields.description, amountCents: fields.amountCents, currency: fields.currency, count: fields.splitAmong.length },
    });
    return id;
  },
});

/** Changes an expense. The person who added it, who paid it, or the organizer may. */
export const update = mutation({
  args: { expenseId: v.id("expenses"), ...expenseArgs },
  handler: async (ctx, { expenseId, ...input }) => {
    const expense = await ctx.db.get("expenses", expenseId);
    if (!expense || expense.isSettlement) return fail("notAllowed");
    const { trip, userId } = await getMemberTrip(ctx, expense.tripId);
    if (expense.createdBy !== userId && expense.paidBy !== userId && trip.userId !== userId) fail("notAllowed");
    await ctx.db.patch("expenses", expenseId, await validate(ctx, trip, input));
  },
});

export const remove = mutation({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, { expenseId }) => {
    const expense = await ctx.db.get("expenses", expenseId);
    if (!expense) return;
    const { trip, userId } = await getMemberTrip(ctx, expense.tripId);
    if (expense.createdBy !== userId && expense.paidBy !== userId && trip.userId !== userId) fail("notAllowed");
    await ctx.db.delete("expenses", expenseId);
  },
});

/**
 * Records that `from` paid `to` back. Either of them (or the organizer) can record it.
 * Partial payments are fine; paying more than is owed is refused so nobody ends up
 * owing money for having paid.
 */
export const recordPayment = mutation({
  args: { tripId: v.id("trips"), from: v.string(), to: v.string(), amountCents: v.number() },
  handler: async (ctx, { tripId, from, to, amountCents }) => {
    const { trip, userId } = await getMemberTrip(ctx, tripId);
    if (userId !== from && userId !== to && userId !== trip.userId) fail("notAllowed");
    const cents = Math.round(amountCents);
    if (!Number.isFinite(cents) || cents <= 0) fail("badAmount");
    const { net } = await loadLedger(ctx, tripId);
    const max = maxPayment(net, from, to);
    if (max === 0) fail("nothingOwed");
    if (cents > max) fail("tooMuch");
    const id = await ctx.db.insert("settlements", { tripId, from, to, amountCents: cents, createdBy: userId });
    const { name } = await getCallerProfile(ctx);
    await notify(ctx, trip, { kind: "settled", actorId: userId, to: [from, to], params: { name: name.split(" ")[0], amountCents: cents, currency: await pinGroupCurrency(ctx, trip) } });
    return id;
  },
});

/** Undoes a recorded payment (also accepts the old expense-row payments). */
export const removePayment = mutation({
  args: { paymentId: v.union(v.id("settlements"), v.id("expenses")) },
  handler: async (ctx, { paymentId }) => {
    const settlementId = ctx.db.normalizeId("settlements", paymentId);
    if (!settlementId) {
      const legacy = await ctx.db.get("expenses", paymentId as Id<"expenses">);
      if (!legacy?.isSettlement) return;
      const { trip, userId } = await getMemberTrip(ctx, legacy.tripId);
      if (![legacy.createdBy, legacy.paidBy, ...legacy.splitAmong, trip.userId].includes(userId)) fail("notAllowed");
      return await ctx.db.delete("expenses", legacy._id);
    }
    const row = await ctx.db.get("settlements", settlementId);
    if (!row) return;
    const { trip, userId } = await getMemberTrip(ctx, row.tripId);
    if (![row.createdBy, row.from, row.to, trip.userId].includes(userId)) fail("notAllowed");
    await ctx.db.delete("settlements", settlementId);
  },
});

/**
 * Switches the currency balances are kept in. `rate` is what 1 unit of the current
 * group currency is worth in the new one (the apps fetch today's with fx.rate).
 * Every expense's rate and every payment are converted with it; expenses paid in the
 * new currency itself become exact again. Only the organizer can do this.
 */
export const setGroupCurrency = mutation({
  args: { tripId: v.id("trips"), currency: v.string(), rate: v.number() },
  handler: async (ctx, { tripId, currency, rate }) => {
    const { trip, userId } = await getMemberTrip(ctx, tripId);
    if (trip.userId !== userId) fail("notAllowed");
    if (!isCode(currency)) fail("badCurrency");
    const old = await pinGroupCurrency(ctx, trip);
    if (old === currency) return;
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1e6) fail("needRate");
    const [expenses, settlements] = await Promise.all([
      ctx.db.query("expenses").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("settlements").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    for (const e of expenses) {
      if (e.isSettlement) {
        await ctx.db.patch("expenses", e._id, { amountCents: Math.max(1, Math.round(e.amountCents * rate)) });
        continue;
      }
      const paidIn = currencyOf(e, trip);
      await ctx.db.patch("expenses", e._id, { currency: paidIn, rate: paidIn === currency ? 1 : (e.rate ?? 1) * rate });
    }
    for (const s of settlements) await ctx.db.patch("settlements", s._id, { amountCents: Math.max(1, Math.round(s.amountCents * rate)) });
    await ctx.db.patch("trips", tripId, { groupCurrency: currency });
  },
});

/**
 * One-off: moves payments stored the old way (expenses with isSettlement) into the
 * settlements table. Run once per deployment: `npx convex run expenses:migrateLegacySettlements`.
 */
export const migrateLegacySettlements = internalMutation({
  args: {},
  handler: async (ctx) => {
    let moved = 0;
    for await (const e of ctx.db.query("expenses")) {
      if (!e.isSettlement) continue;
      const to = e.splitAmong[0];
      if (to) await ctx.db.insert("settlements", { tripId: e.tripId, from: e.paidBy, to, amountCents: e.amountCents, createdBy: e.createdBy });
      await ctx.db.delete("expenses", e._id);
      moved++;
    }
    return { moved };
  },
});
