import { ConvexError } from "convex/values";
import { checkSplit, FULL_PERCENT, parseAmount, proportional, shares, type Split, type SplitError, type SplitMode } from "./settle";

/**
 * The add/edit expense form, as plain data, so web and mobile behave the same.
 * The form keeps one text input per person; `readDraft` turns it into a Split
 * the server will accept, a live preview of everyone's share, and what's left.
 */
export type Draft = { mode: SplitMode; people: string[]; inputs: Record<string, string> };

export type DraftReading = {
  /** Ready to send, or null while something is missing or wrong. */
  split: Split | null;
  error: SplitError | "badAmount" | null;
  /** Each included person's share in cents, as far as it can be worked out. */
  preview: Record<string, number>;
  /** Exact: cents still to assign (negative is over). Percent: basis points. Otherwise null. */
  remaining: number | null;
};

const centsText = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, "");
const percentText = (bp: number) => (bp / 100).toFixed(2).replace(/\.?0+$/, "");

/** Reads one typed value: cents for exact, basis points for percent, a whole number of shares. */
function readValue(mode: SplitMode, text: string): number | null {
  const s = text.trim();
  if (mode === "shares") return /^\d{1,3}$/.test(s) ? Number(s) : s === "" ? 0 : null;
  if (s === "") return 0;
  return parseAmount(s);
}

export function readDraft(amountCents: number | null, draft: Draft): DraftReading {
  const { mode, people } = draft;
  const amount = amountCents != null && amountCents > 0 ? amountCents : null;
  const values = mode === "equal" ? undefined : people.map((p) => readValue(mode, draft.inputs[p] ?? ""));
  const bad = values?.some((v) => v == null) ?? false;
  const split: Split = { mode, people, values: values?.map((v) => v ?? 0) };

  let remaining: number | null = null;
  if (mode === "exact" && amount != null) remaining = amount - split.values!.reduce((s, v) => s + v, 0);
  if (mode === "percent") remaining = FULL_PERCENT - split.values!.reduce((s, v) => s + v, 0);

  const preview: Record<string, number> = {};
  if (amount != null && people.length > 0) {
    // Percent shows each share of the amount even before the total hits 100%.
    const cents = mode === "percent" ? people.map((_, i) => Math.floor((amount * split.values![i]!) / FULL_PERCENT)) : mode === "shares" && !split.values!.some((v) => v > 0) ? people.map(() => 0) : shares(amount, split).map(([, c]) => c);
    people.forEach((p, i) => (preview[p] = cents[i]!));
  }

  const error = amount == null ? "badAmount" : bad ? "badValue" : checkSplit(amount, split);
  return { split: error ? null : split, error, preview, remaining };
}

/** Starting values when the user switches to `mode`: an even split they can adjust. */
export function prefill(mode: SplitMode, people: string[], amountCents: number | null): Record<string, string> {
  if (mode === "equal" || people.length === 0) return {};
  if (mode === "shares") return Object.fromEntries(people.map((p) => [p, "1"]));
  const parts = proportional(mode === "percent" ? FULL_PERCENT : (amountCents ?? 0), people.map(() => 1));
  if (mode === "exact" && !amountCents) return Object.fromEntries(people.map((p) => [p, ""]));
  return Object.fromEntries(people.map((p, i) => [p, mode === "percent" ? percentText(parts[i]!) : centsText(parts[i]!)]));
}

/** The form for an expense that already exists. */
export function draftFrom(expense: { mode: SplitMode; shares: { userId: string; value: number | null }[] }): Draft {
  const { mode } = expense;
  const text = (v: number | null) => (v == null ? "" : mode === "exact" ? centsText(v) : mode === "percent" ? percentText(v) : String(v));
  return { mode, people: expense.shares.map((s) => s.userId), inputs: mode === "equal" ? {} : Object.fromEntries(expense.shares.map((s) => [s.userId, text(s.value)])) };
}

/** Amount text for an edit form. */
export const amountText = centsText;
export const percentLabel = percentText;

/** The error code a split mutation failed with (see ExpenseErrorCode), or null for anything else. */
export function errorCode(e: unknown): string | null {
  if (e instanceof ConvexError && typeof e.data === "object" && e.data && typeof (e.data as { code?: unknown }).code === "string") return (e.data as { code: string }).code;
  return null;
}
