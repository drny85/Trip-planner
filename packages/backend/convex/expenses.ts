import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { findMembership, getCallerProfile, getMemberTrip, getOptionalUserId } from "./lib/auth";
import { listMembers } from "./lib/members";
import { notify } from "./lib/notify";
import { checkSplit, ledger, maxPayment, settleUp, shares, type Expense, type Payment, type Split, type SplitError, type SplitMode } from "./lib/settle";
import { splitInput } from "./lib/validators";

/**
 * Shared costs on a trip: expenses (who paid, and how it's split) and payments
 * (who paid whom back). `forTrip` returns everything the apps need already worked
 * out, so both screens stay simple. The math is in lib/settle.ts.
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
  | SplitError;
const fail = (code: ExpenseErrorCode): never => {
  throw new ConvexError({ code });
};

/** A stored row as the split it describes. Old rows have no mode, so they're equal splits. */
function splitOf(e: Doc<"expenses">): Split {
  return { mode: e.splitMode ?? "equal", people: e.splitAmong, values: e.splitValues };
}

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
    expenses.map((e): Expense => ({ paidBy: e.paidBy, amountCents: e.amountCents, split: splitOf(e) })),
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
    const [{ expenses, payments, totals, net }, members] = await Promise.all([loadLedger(ctx, tripId), listMembers(ctx, trip)]);
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
        return {
          kind: "expense" as const,
          _id: e._id,
          _creationTime: e._creationTime,
          description: e.description,
          amountCents: e.amountCents,
          paidBy: e.paidBy,
          mode: split.mode,
          /** Each person's share in cents, plus what was typed for non-equal splits. */
          shares: shares(e.amountCents, split).map(([who, cents], i) => ({ userId: who, cents, value: split.values?.[i] ?? null })),
          myShareCents: shares(e.amountCents, split).find(([who]) => who === userId)?.[1] ?? 0,
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
      currency: trip.currency ?? "USD",
      me: userId,
      people,
      entries,
      totalCents: expenses.reduce((s, e) => s + e.amountCents, 0),
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
};

/** Checks an expense against the trip's members and returns the cleaned-up fields. */
async function validate(ctx: MutationCtx, trip: Doc<"trips">, input: { description: string; amountCents: number; paidBy: string; split: Split }) {
  const cents = Math.round(input.amountCents);
  if (!Number.isFinite(cents) || cents <= 0 || cents > MAX_CENTS) fail("badAmount");
  const members = new Set((await listMembers(ctx, trip)).map((m) => m.userId));
  const { people } = input.split;
  if (!members.has(input.paidBy) || people.some((p) => !members.has(p))) fail("notOnTrip");
  const mode: SplitMode = input.split.mode;
  const values = mode === "equal" ? undefined : input.split.values?.map((x) => Math.round(x));
  const problem = checkSplit(cents, { mode, people, values });
  if (problem) fail(problem);
  return {
    description: input.description.trim().slice(0, 80) || "Expense",
    amountCents: cents,
    paidBy: input.paidBy,
    splitAmong: people,
    splitMode: mode,
    splitValues: values,
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
      params: { name: name.split(" ")[0], item: fields.description, amountCents: fields.amountCents, currency: trip.currency ?? "USD", count: fields.splitAmong.length },
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
    await notify(ctx, trip, { kind: "settled", actorId: userId, to: [from, to], params: { name: name.split(" ")[0], amountCents: cents, currency: trip.currency ?? "USD" } });
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
