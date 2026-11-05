/**
 * Splitting costs, as pure functions so the server and both apps agree to the cent.
 *
 * Money is always whole cents (the smallest unit we store), so every split adds up
 * exactly to what was paid. The model is a small ledger:
 *
 * - An **expense** is something one person paid for. Its split says how much of it is
 *   each person's share, in one of four ways (see `SplitMode`).
 * - A **payment** (settlement) is money one person sent another to even things out.
 * - A person's **balance** = what they paid + what they were paid back to them
 *   - their shares - what others sent them. Positive means the group owes them.
 *
 * `settleUp` then suggests a short list of payments that brings everyone to zero.
 */

/**
 * How an expense is divided between the people in it.
 * - `equal`: everyone pays the same.
 * - `exact`: each person's share is typed in, in cents; they must add up to the total.
 * - `shares`: each person has a whole number of shares (2 for a couple, 1 for a single).
 * - `percent`: each person has a percentage, in basis points (100% = 10000).
 */
export type SplitMode = "equal" | "exact" | "shares" | "percent";
export const SPLIT_MODES: SplitMode[] = ["equal", "exact", "shares", "percent"];
export const FULL_PERCENT = 10_000;

/** A split as entered: who is in it and, except for `equal`, one value per person. */
export type Split = { mode: SplitMode; people: string[]; values?: number[] };
export type Expense = { paidBy: string; amountCents: number; split: Split };
export type Payment = { from: string; to: string; amountCents: number };
export type Transfer = Payment;

/** Why a split can't be saved. The apps turn each code into a translated message. */
export type SplitError =
  | "noPeople"
  | "duplicatePeople"
  | "missingValues"
  | "badValue"
  | "noShares"
  | "exactMismatch"
  | "percentMismatch";

/** Returns what's wrong with a split, or null when it can be saved. */
export function checkSplit(amountCents: number, split: Split): SplitError | null {
  const { mode, people, values } = split;
  if (people.length === 0) return "noPeople";
  if (new Set(people).size !== people.length) return "duplicatePeople";
  if (mode === "equal") return null;
  if (!values || values.length !== people.length) return "missingValues";
  if (values.some((v) => !Number.isInteger(v) || v < 0)) return "badValue";
  const sum = values.reduce((s, v) => s + v, 0);
  if (mode === "exact" && sum !== amountCents) return "exactMismatch";
  if (mode === "percent" && sum !== FULL_PERCENT) return "percentMismatch";
  if (mode === "shares" && sum === 0) return "noShares";
  return null;
}

/**
 * Divides `amountCents` in proportion to `weights`. The leftover cents of an uneven
 * split go to the largest remainders, and on a tie to whoever is listed first, so the
 * result is the same everywhere and always adds up to `amountCents`.
 */
export function proportional(amountCents: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (amountCents * w) / total);
  const out = exact.map(Math.floor);
  let left = amountCents - out.reduce((s, c) => s + c, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]! += 1;
    left -= 1;
  }
  return out;
}

/** Each person's share of one expense, in cents, in the split's order. */
export function shares(amountCents: number, split: Split): [string, number][] {
  const { mode, people, values = [] } = split;
  const cents =
    mode === "equal" ? proportional(amountCents, people.map(() => 1)) : mode === "exact" ? people.map((_, i) => values[i] ?? 0) : proportional(amountCents, people.map((_, i) => values[i] ?? 0));
  return people.map((p, i) => [p, cents[i]!]);
}

export type PersonTotals = {
  /** What they paid for the group. */
  paidCents: number;
  /** Their part of all expenses. */
  shareCents: number;
  /** Payments they sent to others. */
  sentCents: number;
  /** Payments others sent them. */
  receivedCents: number;
  /** paid + sent - share - received. Positive: they're owed. Negative: they owe. */
  netCents: number;
};

const emptyTotals = (): PersonTotals => ({ paidCents: 0, shareCents: 0, sentCents: 0, receivedCents: 0, netCents: 0 });

/** Per-person totals for the whole trip. Expenses that fail `checkSplit` are skipped. */
export function ledger(expenses: Expense[], payments: Payment[]): Map<string, PersonTotals> {
  const out = new Map<string, PersonTotals>();
  const of = (who: string) => {
    let t = out.get(who);
    if (!t) out.set(who, (t = emptyTotals()));
    return t;
  };
  for (const e of expenses) {
    if (e.amountCents <= 0 || checkSplit(e.amountCents, e.split)) continue;
    of(e.paidBy).paidCents += e.amountCents;
    for (const [who, cents] of shares(e.amountCents, e.split)) of(who).shareCents += cents;
  }
  for (const p of payments) {
    if (p.amountCents <= 0 || p.from === p.to) continue;
    of(p.from).sentCents += p.amountCents;
    of(p.to).receivedCents += p.amountCents;
  }
  for (const t of out.values()) t.netCents = t.paidCents + t.sentCents - t.shareCents - t.receivedCents;
  return out;
}

/** Just the net balance per person. */
export function balances(expenses: Expense[], payments: Payment[] = []): Map<string, number> {
  return new Map([...ledger(expenses, payments)].map(([who, t]) => [who, t.netCents]));
}

/**
 * A short list of payments that settles everyone up: the person who owes the most pays
 * the person owed the most, until everyone is at zero. At most (people - 1) payments.
 */
export function settleUp(net: Map<string, number>): Transfer[] {
  const owed = [...net].filter(([, c]) => c > 0).map(([who, c]) => ({ who, c })).sort((a, b) => b.c - a.c || a.who.localeCompare(b.who));
  const owes = [...net].filter(([, c]) => c < 0).map(([who, c]) => ({ who, c: -c })).sort((a, b) => b.c - a.c || a.who.localeCompare(b.who));
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < owes.length && j < owed.length) {
    const pay = Math.min(owes[i]!.c, owed[j]!.c);
    if (pay > 0) out.push({ from: owes[i]!.who, to: owed[j]!.who, amountCents: pay });
    owes[i]!.c -= pay;
    owed[j]!.c -= pay;
    if (owes[i]!.c === 0) i++;
    if (owed[j]!.c === 0) j++;
  }
  return out;
}

/** The most `from` can pay `to` without flipping either balance past zero. */
export function maxPayment(net: Map<string, number>, from: string, to: string): number {
  if (from === to) return 0;
  return Math.max(0, Math.min(-(net.get(from) ?? 0), net.get(to) ?? 0));
}

/**
 * Reads a typed amount into cents. Accepts "12", "12.5", "12,50", "1,234.56" and
 * "1.234,56": when both separators appear the last one is the decimal point; a lone
 * separator followed by exactly three digits ("1,234" or "1.234") groups thousands.
 */
export function parseAmount(input: string): number | null {
  let s = input.replace(/[^\d.,-]/g, "");
  if (!s || s.startsWith("-")) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    s = parts.length === 2 && parts[1]!.length !== 3 ? parts.join(".") : parts.join("");
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    if (parts.length > 2 || parts[1]!.length === 3) s = parts.join("");
  }
  if (!/^\d*(\.\d{0,2})?$/.test(s) || s === "" || s === ".") return null;
  const cents = Math.round(parseFloat(s) * 100);
  return Number.isFinite(cents) ? cents : null;
}

/** Turns a percentage the user typed ("33.33") into basis points (3333). */
export function percentToBasisPoints(input: string): number | null {
  const cents = parseAmount(input);
  return cents == null ? null : cents;
}
