import { v, type Infer } from "convex/values";

/**
 * Price and flight alerts. Everything here is pure (parsing provider answers,
 * deciding when something is worth a notification, picking the next check
 * time) so it can be tested without a network or a database.
 *
 * Providers, both with a free tier:
 * - Prices: SerpApi's Google Flights and Google Hotels engines (SERPAPI_API_KEY).
 * - Flight status: AeroDataBox on RapidAPI (AERODATABOX_API_KEY).
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

/** What we last saw for a flight. Times are the departure airport's local clock. */
export const flightSnapshot = v.object({
  status: v.string(),
  /** Departure in UTC ms: the revised time when there is one, else the scheduled one. */
  depUtc: v.optional(v.number()),
  depScheduledTime: v.optional(v.string()),
  depTime: v.optional(v.string()),
  delayMinutes: v.number(),
  depTerminal: v.optional(v.string()),
  depGate: v.optional(v.string()),
  arrTime: v.optional(v.string()),
  arrTerminal: v.optional(v.string()),
  arrGate: v.optional(v.string()),
  arrBelt: v.optional(v.string()),
});
export type FlightSnapshot = Infer<typeof flightSnapshot>;

/** What we've already told the group about, so the same news isn't sent twice. */
export const flightAlerted = v.object({
  delayMinutes: v.optional(v.number()),
  gate: v.optional(v.string()),
  canceled: v.optional(v.boolean()),
});
export type FlightAlerted = Infer<typeof flightAlerted>;

type BookingLike = { kind: string; title: string; provider?: string; details?: string; address?: string };

const FLIGHT_NO = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})\b/;

/** "UA837" from "Flight UA 837 · SFO → NRT". Only the title: the details hold look-alikes such as "Gate B12". */
export function flightNumberOf(b: BookingLike): string | undefined {
  if (b.kind !== "flight") return undefined;
  const m = b.title.match(FLIGHT_NO);
  return m ? `${m[1]}${m[2]}` : undefined;
}

/** ["SFO", "NRT"] from "SFO → NRT", "SFO-NRT" or "SFO to NRT" in the title. */
export function airportsOf(b: BookingLike): { from?: string; to?: string } {
  const m = b.title.match(/\b([A-Z]{3})\b\s*(?:→|->|–|—|-|>|\/|\bto\b|\ba\b|\bnach\b|\bà\b|\bpara\b|から)\s*\b([A-Z]{3})\b/);
  if (m) return { from: m[1], to: m[2] };
  const fromAddress = b.address?.match(/\(([A-Z]{3})\)/)?.[1];
  return { from: fromAddress };
}

export const isAirportCode = (s?: string) => Boolean(s && /^[A-Z]{3}$/.test(s));
const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();

// ---------- Prices (SerpApi) ----------

type SerpFlight = { flight_number?: string };
type SerpItinerary = { flights?: SerpFlight[]; price?: number };
export type SerpFlightsResponse = {
  error?: string;
  best_flights?: SerpItinerary[];
  other_flights?: SerpItinerary[];
  price_insights?: { lowest_price?: number };
};

/**
 * The price of our flight when it's in the results (matched by flight number),
 * else the cheapest fare on the route that day. Prices come in whole currency units.
 */
export function pickFlightPrice(res: SerpFlightsResponse, flightNumber?: string): { cents: number; matched: boolean } | null {
  const all = [...(res.best_flights ?? []), ...(res.other_flights ?? [])].filter((i) => typeof i.price === "number" && i.price > 0);
  if (flightNumber) {
    const ours = all.find((i) => i.flights?.[0]?.flight_number && norm(i.flights[0].flight_number) === norm(flightNumber));
    if (ours) return { cents: Math.round(ours.price! * 100), matched: true };
  }
  const prices = all.map((i) => i.price!);
  if (res.price_insights?.lowest_price) prices.push(res.price_insights.lowest_price);
  return prices.length ? { cents: Math.round(Math.min(...prices) * 100), matched: false } : null;
}

type SerpRate = { extracted_lowest?: number };
type SerpProperty = { name?: string; property_token?: string; rate_per_night?: SerpRate; total_rate?: SerpRate };
export type SerpHotelsResponse = SerpProperty & { error?: string; properties?: SerpProperty[] };

const STOP = new Set(["hotel", "hotels", "the", "and", "inn", "resort", "suites", "check", "stay"]);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );

/**
 * The stay's total price. With a property token the answer is that one hotel;
 * otherwise we find ours by a distinctive word of its name (the city's name doesn't count).
 */
export function pickHotelPrice(
  res: SerpHotelsResponse,
  name: string,
  nights: number,
  destination = "",
): { cents: number; matched: boolean; propertyToken?: string } | null {
  const total = (p: SerpProperty) => p.total_rate?.extracted_lowest ?? (p.rate_per_night?.extracted_lowest ? p.rate_per_night.extracted_lowest * nights : undefined);
  if (!res.properties && total(res)) return { cents: Math.round(total(res)! * 100), matched: true, propertyToken: res.property_token };
  const city = words(destination);
  const mine = new Set([...words(name)].filter((w) => !city.has(w)));
  const candidates = (res.properties ?? []).filter((p) => total(p));
  const ours = candidates.find((p) => [...words(p.name ?? "")].some((w) => mine.has(w)));
  if (ours) return { cents: Math.round(total(ours)! * 100), matched: true, propertyToken: ours.property_token };
  return null;
}

export const nightsBetween = (checkIn: string, checkOut: string) => Math.max(1, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / (24 * HOUR)));

/**
 * The price worth comparing against: the last price we alerted at, else what
 * they paid, else the first price we saw. An alert needs a drop of at least 5%
 * (and at least 10 currency units), so small daily wobbles stay quiet.
 */
export function priceDrop(w: { paidCents?: number; firstCents?: number; alertedCents?: number }, nowCents: number): { wasCents: number } | null {
  const reference = w.alertedCents ?? w.paidCents ?? w.firstCents;
  if (reference === undefined) return null;
  const threshold = Math.max(Math.round(reference * 0.05), 1000);
  return nowCents <= reference - threshold ? { wasCents: reference } : null;
}

// ---------- Flight status (AeroDataBox) ----------

type AdbTime = { utc?: string; local?: string };
type AdbMovement = {
  airport?: { iata?: string };
  scheduledTime?: AdbTime;
  revisedTime?: AdbTime;
  predictedTime?: AdbTime;
  terminal?: string;
  gate?: string;
  baggageBelt?: string;
};
export type AdbFlight = { number?: string; status?: string; codeshareStatus?: string; departure?: AdbMovement; arrival?: AdbMovement };

/** "2026-11-10 14:35+09:00" -> "14:35". */
const localHHMM = (t?: AdbTime) => t?.local?.match(/[ T](\d{2}:\d{2})/)?.[1];
/** "2026-11-10 05:35Z" -> ms. */
const utcMs = (t?: AdbTime) => {
  if (!t?.utc) return undefined;
  const ms = Date.parse(t.utc.trim().replace(" ", "T"));
  return Number.isNaN(ms) ? undefined : ms;
};
const short = (s?: string) => s?.trim().slice(0, 12) || undefined;

/** Our flight from an AeroDataBox answer: the leg departing on `date`, preferring the operating carrier. */
export function parseFlightStatus(flights: AdbFlight[], date: string, from?: string): FlightSnapshot | null {
  const onDate = flights.filter((f) => !f.departure?.scheduledTime?.local || f.departure.scheduledTime.local.startsWith(date));
  const legs = from ? onDate.filter((f) => !f.departure?.airport?.iata || f.departure.airport.iata === from) : onDate;
  const pool = legs.length ? legs : onDate;
  const f = pool.find((x) => x.codeshareStatus !== "IsCodeshared") ?? pool[0];
  if (!f) return null;
  const dep = f.departure ?? {};
  const arr = f.arrival ?? {};
  const scheduled = utcMs(dep.scheduledTime);
  const revised = utcMs(dep.revisedTime) ?? utcMs(dep.predictedTime);
  const delay = scheduled && revised ? Math.round((revised - scheduled) / MINUTE) : 0;
  return {
    status: f.status ?? "Unknown",
    depUtc: revised ?? scheduled,
    depScheduledTime: localHHMM(dep.scheduledTime),
    depTime: localHHMM(dep.revisedTime) ?? localHHMM(dep.predictedTime) ?? localHHMM(dep.scheduledTime),
    delayMinutes: Math.max(0, delay),
    depTerminal: short(dep.terminal),
    depGate: short(dep.gate),
    arrTime: localHHMM(arr.revisedTime) ?? localHHMM(arr.predictedTime) ?? localHHMM(arr.scheduledTime),
    arrTerminal: short(arr.terminal),
    arrGate: short(arr.gate),
    arrBelt: short(arr.baggageBelt),
  };
}

const AIRBORNE = new Set(["Departed", "EnRoute", "Approaching", "Arrived", "Diverted"]);
export const isFinal = (status: string) => AIRBORNE.has(status) || status === "Canceled";

export type FlightNews = { canceled?: true; delay?: { minutes: number; time?: string }; gate?: string };

/**
 * What's new since we last told the group: a cancellation, a delay that moved by
 * 15 minutes or more, or a different departure gate. Nothing once it has left.
 */
export function flightNews(next: FlightSnapshot, alerted: FlightAlerted): FlightNews {
  if (AIRBORNE.has(next.status)) return {};
  if (next.status === "Canceled") return alerted.canceled ? {} : { canceled: true };
  const news: FlightNews = {};
  const was = alerted.delayMinutes ?? 0;
  if (next.delayMinutes >= 15 && next.depTime && Math.abs(next.delayMinutes - was) >= 15) news.delay = { minutes: next.delayMinutes, time: next.depTime };
  if (next.depGate && next.depGate !== alerted.gate) news.gate = next.depGate;
  return news;
}

/**
 * When to look again. Free tiers are small, so checks get closer together only
 * as departure nears: one look two days out (terminal, schedule changes), every
 * 6 hours until 6 hours out, hourly until 2 hours out, then every 15 minutes
 * until it leaves. `null` means we're done with this flight.
 */
export function nextFlightCheck(now: number, depUtc: number, status?: string): number | null {
  if (status && isFinal(status)) return null;
  const until = depUtc - now;
  if (until > 48 * HOUR) return depUtc - 48 * HOUR;
  if (until > 6 * HOUR) return Math.min(now + 6 * HOUR, depUtc - 6 * HOUR);
  if (until > 2 * HOUR) return Math.min(now + HOUR, depUtc - 2 * HOUR);
  // Delayed flights can leave well after the scheduled time; give up 12 hours past it.
  if (until > -12 * HOUR) return now + 15 * MINUTE;
  return null;
}

/** Before the first answer we only know the local departure time; treat it as UTC (off by at most 14 hours). */
export const roughDeparture = (date: string, time?: string) => Date.parse(`${date}T${time ?? "12:00"}:00Z`);

/** Today's date in UTC, "YYYY-MM-DD". */
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ---------- Demo provider (ALERTS_DEMO=true) ----------

/** A made-up fare that falls ~8% on every check, so price alerts can be tried without an API key. */
export function demoPrice(seed: string, checks: number): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const base = 30000 + (h % 70000);
  return Math.round(base * Math.pow(0.92, checks));
}

/** A made-up status: on time with a gate, then 40 minutes late at a new gate. */
export function demoFlight(depUtc: number, checks: number, scheduledTime?: string): FlightSnapshot {
  const late = checks >= 1;
  const time = (hhmm: string | undefined, plus: number) => {
    if (!hhmm) return undefined;
    const [h, m] = hhmm.split(":").map(Number);
    const total = (h! * 60 + m! + plus) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  return {
    status: late ? "Delayed" : "Expected",
    depUtc: depUtc + (late ? 40 * MINUTE : 0),
    depScheduledTime: scheduledTime,
    depTime: time(scheduledTime, late ? 40 : 0),
    delayMinutes: late ? 40 : 0,
    depTerminal: "2",
    depGate: late ? "B14" : "B12",
  };
}
