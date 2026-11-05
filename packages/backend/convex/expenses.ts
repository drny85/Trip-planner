import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { formatCents } from "./lib/format";
import { findMembership, getCallerProfile, getMemberTrip, getOptionalUserId } from "./lib/auth";
import { listMembers } from "./lib/members";
import { notify } from "./lib/notify";
import { balances, settleUp } from "./lib/settle";

/** Shared costs: who paid for what, and who owes whom. */

export const forTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || !userId || !(await findMembership(ctx, trip, userId))) return null;
    const [rows, members] = await Promise.all([
      ctx.db.query("expenses").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).order("desc").collect(),
      listMembers(ctx, trip),
    ]);
    const names = new Map(members.map((m) => [m.userId, m.name]));
    const nameOf = (id: string) => (id === userId ? "You" : (names.get(id) ?? "Former member"));
    const net = balances(rows);
    const isOwner = trip.userId === userId;
    return {
      currency: trip.currency ?? "USD",
      members: members.map((m) => ({ userId: m.userId, name: m.name, isMe: m.userId === userId })),
      expenses: rows.map((e) => ({
        _id: e._id,
        _creationTime: e._creationTime,
        description: e.description,
        amountCents: e.amountCents,
        isSettlement: e.isSettlement ?? false,
        paidBy: e.paidBy,
        paidByName: nameOf(e.paidBy),
        splitAmong: e.splitAmong,
        splitNames: e.splitAmong.map(nameOf),
        canDelete: isOwner || e.createdBy === userId,
      })),
      totalCents: rows.filter((e) => !e.isSettlement).reduce((s, e) => s + e.amountCents, 0),
      myBalanceCents: net.get(userId) ?? 0,
      transfers: settleUp(net).map((t) => ({ ...t, fromName: nameOf(t.from), toName: nameOf(t.to), involvesMe: t.from === userId || t.to === userId })),
    };
  },
});

export const add = mutation({
  args: {
    tripId: v.id("trips"),
    description: v.string(),
    amountCents: v.number(),
    paidBy: v.string(),
    splitAmong: v.array(v.string()),
  },
  handler: async (ctx, { tripId, description, amountCents, paidBy, splitAmong }) => {
    const { trip, userId } = await getMemberTrip(ctx, tripId);
    const cents = Math.round(amountCents);
    if (!Number.isFinite(cents) || cents <= 0 || cents > 100_000_000) throw new Error("Enter an amount above zero");
    const members = new Set((await listMembers(ctx, trip)).map((m) => m.userId));
    const among = [...new Set(splitAmong)];
    if (!members.has(paidBy) || among.length === 0 || among.some((m) => !members.has(m))) throw new Error("Pick people on this trip");
    const text = description.trim().slice(0, 80) || "Expense";
    const id = await ctx.db.insert("expenses", { tripId, description: text, amountCents: cents, paidBy, splitAmong: among, createdBy: userId });
    const { name } = await getCallerProfile(ctx);
    await notify(ctx, trip, { kind: "expense", actorId: userId, to: among, text: `${name.split(" ")[0]} added ${text} (${formatCents(cents, trip.currency)}), split ${among.length} ways.` });
    return id;
  },
});

/** Records that `from` paid `to` back, which zeroes out what they owed. */
export const settle = mutation({
  args: { tripId: v.id("trips"), from: v.string(), to: v.string(), amountCents: v.number() },
  handler: async (ctx, { tripId, from, to, amountCents }) => {
    const { trip, userId } = await getMemberTrip(ctx, tripId);
    if (userId !== from && userId !== to && userId !== trip.userId) throw new Error("Only the two people involved can settle this");
    const cents = Math.round(amountCents);
    if (cents <= 0 || from === to) throw new Error("Nothing to settle");
    const id = await ctx.db.insert("expenses", { tripId, description: "Settled up", amountCents: cents, paidBy: from, splitAmong: [to], createdBy: userId, isSettlement: true });
    const { name } = await getCallerProfile(ctx);
    await notify(ctx, trip, { kind: "settled", actorId: userId, to: [from, to], text: `${name.split(" ")[0]} marked ${formatCents(cents, trip.currency)} as paid back.` });
    return id;
  },
});

export const remove = mutation({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, { expenseId }) => {
    const expense = await ctx.db.get("expenses", expenseId);
    if (!expense) return;
    const { trip, userId } = await getMemberTrip(ctx, expense.tripId);
    if (expense.createdBy !== userId && trip.userId !== userId) throw new Error("Only who added it, or the organizer, can delete it");
    await ctx.db.delete("expenses", expenseId);
  },
});
