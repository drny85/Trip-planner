/**
 * How the apps show price and flight alerts (see packages/backend/convex/alerts.ts).
 * Shared so web and mobile read the same numbers the same way.
 */

type Watch = { paidCents?: number; firstCents?: number; lastCents?: number; lowestCents?: number; history: { cents: number }[] };

/** Today's price against what was paid (or the first price seen). Negative `deltaCents` means cheaper. */
export function priceSummary(w: Watch) {
  const referenceCents = w.paidCents ?? w.firstCents;
  const deltaCents = w.lastCents !== undefined && referenceCents !== undefined ? w.lastCents - referenceCents : undefined;
  return {
    referenceCents,
    referenceIsPaid: w.paidCents !== undefined,
    deltaCents,
    /** Lowest seen, worth showing only when it differs from today's. */
    lowestCents: w.lowestCents !== undefined && w.lowestCents !== w.lastCents ? w.lowestCents : undefined,
    trend: w.history.map((h) => h.cents),
  };
}

export type FlightTone = "good" | "warn" | "bad" | "neutral";

/** Colour for a flight status, by how worried a traveler should be. */
export function flightTone(status: string, delayMinutes = 0): FlightTone {
  if (status === "Canceled" || status === "Diverted" || status === "CanceledUncertain") return "bad";
  if (status === "Delayed" || delayMinutes >= 15) return "warn";
  if (status === "Unknown") return "neutral";
  return "good";
}

/** Points for a tiny sparkline: `width` x `height`, lowest price at the bottom. */
export function sparkline(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`).join(" ");
}

/** The booking hasn't happened yet ("YYYY-MM-DD" vs today's local date). */
export const isUpcoming = (date: string | undefined, today: string) => Boolean(date && date >= today);
