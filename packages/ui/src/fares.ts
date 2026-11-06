import { fromMinutes, toMinutes } from "./today";

/**
 * How the apps read a fare watch (backend: packages/backend/convex/fares.ts):
 * whether now is a good time to book, the nearby-dates grid, and when the
 * first and last days have to fit around the flights.
 */

type Point = { at: number; cents: number };
export type FareLevel = "low" | "typical" | "high";

export type FareVerdict = "book" | "soon" | "wait" | "watch";
export type FareWhy = "lastMinute" | "low" | "falling" | "rising" | "high" | "early" | "typical";

const DAY = 86_400_000;

/** Change over the last `days` days, as a fraction (-0.08 = 8% cheaper). Null with too little data. */
export function fareTrend(points: Point[], days = 14, now = Date.now()): number | null {
  const recent = points.filter((p) => p.at >= now - days * DAY).sort((a, b) => a.at - b.at);
  if (recent.length < 2) return null;
  const first = recent[0]!.cents;
  return first > 0 ? (recent[recent.length - 1]!.cents - first) / first : null;
}

/**
 * "Good time to book?" from Google's price level and typical range, how the
 * price has moved lately and how far off the trip is. Rules of thumb, not a
 * forecast: the last two weeks almost always cost more, a low price is worth
 * taking, a falling one far out is worth waiting on.
 */
export function fareAdvice(input: {
  cents: number;
  daysOut: number;
  level?: FareLevel;
  typicalLowCents?: number;
  typicalHighCents?: number;
  /** Google's history for these dates, then ours. */
  history: Point[];
  now?: number;
}): { verdict: FareVerdict; why: FareWhy; trend: number | null } {
  const trend = fareTrend(input.history, 14, input.now);
  const res = (verdict: FareVerdict, why: FareWhy) => ({ verdict, why, trend });
  if (input.daysOut <= 14) return res("book", "lastMinute");
  if (input.level === "low" || (input.typicalLowCents !== undefined && input.cents <= input.typicalLowCents)) return res("book", "low");
  if (trend !== null && trend <= -0.05 && input.daysOut > 30) return res("wait", "falling");
  if (trend !== null && trend >= 0.05) return res("soon", "rising");
  if (input.level === "high" || (input.typicalHighCents !== undefined && input.cents > input.typicalHighCents)) {
    return input.daysOut > 60 ? res("wait", "high") : res("soon", "high");
  }
  if (input.daysOut > 120) return res("watch", "early");
  return input.daysOut <= 45 ? res("soon", "typical") : res("watch", "typical");
}

/** Google's history and ours, oldest first, with ours winning on the same day. */
export function fareHistory(google: Point[], ours: Point[]): Point[] {
  const byDay = new Map<number, Point>();
  for (const p of [...google, ...ours]) byDay.set(Math.floor(p.at / DAY), p);
  return [...byDay.values()].sort((a, b) => a.at - b.at);
}

export type FlexCellView = { shiftDays: number; outboundDate: string; returnDate?: string; cents?: number; cheapest: boolean; deltaCents?: number };

/** The ±3 day grid with the cheapest cell marked and each price against the trip's own dates. */
export function flexGrid(cells: { shiftDays: number; outboundDate: string; returnDate?: string; cents?: number }[], currentCents?: number): FlexCellView[] {
  const priced = cells.filter((c) => c.cents !== undefined).map((c) => c.cents!);
  const min = priced.length ? Math.min(...priced) : undefined;
  const base = cells.find((c) => c.shiftDays === 0)?.cents ?? currentCents;
  return [...cells]
    .sort((a, b) => a.shiftDays - b.shiftDays)
    .map((c) => ({
      ...c,
      cheapest: c.cents !== undefined && c.cents === min && (base === undefined || c.cents < base),
      deltaCents: c.cents !== undefined && base !== undefined && c.shiftDays !== 0 ? c.cents - base : undefined,
    }));
}

type FlightLike = { startDate?: string; startTime?: string; endDate?: string; endTime?: string };
type DayLike = { _id: string; dayNumber: number; date?: string };

/** Time to clear the airport and get into town after landing. */
export const ARRIVAL_BUFFER_MIN = 90;
/** Leave for the airport this long before take-off (2 hours there, about 1 to get there). */
export const DEPARTURE_BUFFER_MIN = 180;

/**
 * When the first and last days have to fit around the flights: the flight
 * landing on day 1 (free from about 90 minutes after landing), and the flight
 * leaving on the last day (head to the airport 3 hours before). Either can be missing.
 */
export function flightFit(flights: FlightLike[], days: DayLike[]) {
  const first = days[0];
  const last = days.length > 1 ? days[days.length - 1] : undefined;
  let arrive: { subTripId: string; dayNumber: number; lands: string; freeFrom: string } | undefined;
  let leave: { subTripId: string; dayNumber: number; takesOff: string; leaveBy: string } | undefined;

  if (first?.date) {
    const landing = flights
      .filter((f) => (f.endDate ?? f.startDate) === first.date && toMinutes(f.endTime) !== undefined)
      .sort((a, b) => toMinutes(b.endTime)! - toMinutes(a.endTime)!)[0];
    if (landing) {
      const lands = toMinutes(landing.endTime)!;
      arrive = { subTripId: first._id, dayNumber: first.dayNumber, lands: fromMinutes(lands), freeFrom: fromMinutes(Math.min(lands + ARRIVAL_BUFFER_MIN, 23 * 60 + 59)) };
    }
  }
  if (last?.date) {
    const takeoff = flights
      .filter((f) => f.startDate === last.date && toMinutes(f.startTime) !== undefined)
      .sort((a, b) => toMinutes(a.startTime)! - toMinutes(b.startTime)!)[0];
    if (takeoff) {
      const at = toMinutes(takeoff.startTime)!;
      leave = { subTripId: last._id, dayNumber: last.dayNumber, takesOff: fromMinutes(at), leaveBy: fromMinutes(Math.max(0, at - DEPARTURE_BUFFER_MIN)) };
    }
  }
  return { arrive, leave };
}

/** Whole days from `today` to `date` ("YYYY-MM-DD"). */
export const daysUntil = (date: string, today: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
