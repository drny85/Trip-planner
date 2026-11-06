import { v, type Infer } from "convex/values";
import { priceDrop } from "./alerts";

/**
 * Fare watch for travelers who haven't booked a flight yet. Everything here is
 * pure (parsing SerpApi's Google Flights answer, picking the airport, deciding
 * when a fare is worth a push) so it can be tested without a network.
 * The functions that use it live in convex/fares.ts.
 */

const DAY = 86_400_000;

/** One flight option worth showing: the outbound leg of a round trip, or a one-way. */
export const fareOffer = v.object({
  airline: v.string(),
  logo: v.optional(v.string()),
  /** "UA 837 · NH 12" */
  flightNumbers: v.string(),
  depDate: v.string(),
  depTime: v.string(),
  /** Absent when the source only gives the departure (Travelpayouts). */
  arrDate: v.optional(v.string()),
  arrTime: v.optional(v.string()),
  /** The return day, when the fare is for other dates than asked (Travelpayouts' month search). */
  retDate: v.optional(v.string()),
  stops: v.number(),
  durationMinutes: v.number(),
  cents: v.number(),
});
export type FareOffer = Infer<typeof fareOffer>;

/** What Google says about today's price for this route and dates. */
export const fareInsights = v.object({
  level: v.optional(v.union(v.literal("low"), v.literal("typical"), v.literal("high"))),
  typicalLowCents: v.optional(v.number()),
  typicalHighCents: v.optional(v.number()),
  /** Google's own price history for these dates, oldest first (about the last 60 days). */
  history: v.array(v.object({ at: v.number(), cents: v.number() })),
});
export type FareInsights = Infer<typeof fareInsights>;

/** The ±3 day grid: the cheapest fare if the whole trip moved by `shiftDays`. */
export const flexCell = v.object({
  shiftDays: v.number(),
  outboundDate: v.string(),
  returnDate: v.optional(v.string()),
  cents: v.optional(v.number()),
});
export type FlexCell = Infer<typeof flexCell>;

export const FLEX_SHIFTS = [-3, -2, -1, 0, 1, 2, 3] as const;

export const shiftDate = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

// ---------- SerpApi Google Flights ----------

type SerpAirport = { id?: string; time?: string };
type SerpLeg = { departure_airport?: SerpAirport; arrival_airport?: SerpAirport; airline?: string; airline_logo?: string; flight_number?: string };
type SerpItinerary = { flights?: SerpLeg[]; price?: number; total_duration?: number; airline_logo?: string };
export type SerpFareResponse = {
  error?: string;
  best_flights?: SerpItinerary[];
  other_flights?: SerpItinerary[];
  price_insights?: { lowest_price?: number; price_level?: string; typical_price_range?: number[]; price_history?: number[][] };
  search_metadata?: { google_flights_url?: string };
};

/** "2026-12-01 08:05" -> ["2026-12-01", "08:05"]. */
const splitTime = (s?: string): [string, string] | null => {
  const m = s?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? [m[1]!, m[2]!] : null;
};

const toOffer = (i: SerpItinerary): FareOffer | null => {
  const legs = i.flights ?? [];
  const first = legs[0];
  const last = legs[legs.length - 1];
  const dep = splitTime(first?.departure_airport?.time);
  const arr = splitTime(last?.arrival_airport?.time);
  if (!first || !dep || !arr || typeof i.price !== "number" || i.price <= 0) return null;
  const airlines = [...new Set(legs.map((l) => l.airline).filter(Boolean))];
  return {
    airline: airlines.join(" + ").slice(0, 60) || "—",
    logo: i.airline_logo ?? first.airline_logo,
    flightNumbers: legs
      .map((l) => l.flight_number)
      .filter(Boolean)
      .join(" · ")
      .slice(0, 60),
    depDate: dep[0],
    depTime: dep[1],
    arrDate: arr[0],
    arrTime: arr[1],
    stops: Math.max(0, legs.length - 1),
    durationMinutes: Math.max(0, Math.round(i.total_duration ?? 0)),
    cents: Math.round(i.price * 100),
  };
};

const LEVELS = new Set(["low", "typical", "high"]);

/**
 * Today's cheapest fare, the 3 options worth showing (Google's "best" first,
 * then the cheapest others), Google's price insights and its link to the search.
 * Prices come in whole currency units.
 */
export function parseFares(res: SerpFareResponse): { cents: number; offers: FareOffer[]; insights?: FareInsights; googleUrl?: string } | null {
  const best = (res.best_flights ?? []).map(toOffer).filter((o): o is FareOffer => o !== null);
  const other = (res.other_flights ?? []).map(toOffer).filter((o): o is FareOffer => o !== null);
  const all = [...best, ...other];
  const pi = res.price_insights;
  const lowest = Math.min(...all.map((o) => o.cents), pi?.lowest_price ? Math.round(pi.lowest_price * 100) : Infinity);
  if (!Number.isFinite(lowest)) return null;

  const seen = new Set<string>();
  const offers = [...best, ...other.sort((a, b) => a.cents - b.cents)]
    .filter((o) => {
      const key = `${o.flightNumbers}|${o.depTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);

  const range = pi?.typical_price_range;
  const insights: FareInsights | undefined = pi
    ? {
        level: pi.price_level && LEVELS.has(pi.price_level) ? (pi.price_level as "low" | "typical" | "high") : undefined,
        typicalLowCents: typeof range?.[0] === "number" ? Math.round(range[0] * 100) : undefined,
        typicalHighCents: typeof range?.[1] === "number" ? Math.round(range[1] * 100) : undefined,
        history: (pi.price_history ?? [])
          .filter((p) => typeof p[0] === "number" && typeof p[1] === "number")
          .map(([at, price]) => ({ at: at! * 1000, cents: Math.round(price! * 100) }))
          .slice(-60),
      }
    : undefined;

  return { cents: lowest, offers, insights, googleUrl: safeGoogleUrl(res.search_metadata?.google_flights_url) };
}

const safeGoogleUrl = (url?: string) => (url && /^https:\/\/www\.google\.com\/travel\/flights/.test(url) ? url : undefined);

/** A Google Flights search anyone can open: works without SerpApi's link. */
export function googleFlightsUrl(from: string, to: string, outboundDate: string, returnDate?: string, adults = 1, currency = "USD") {
  const q = `Flights from ${from} to ${to} on ${outboundDate}${returnDate ? ` through ${returnDate}` : " one way"}${adults > 1 ? ` for ${adults} adults` : ""}`;
  return `https://www.google.com/travel/flights?${new URLSearchParams({ q, curr: currency })}`;
}

// ---------- Alerts ----------

/**
 * Whether today's fare is worth a push to the traveler watching it.
 * - With a target price: "target" once the fare reaches it, then again only on a
 *   further real drop (recordFare forgets the alert when the fare climbs back above).
 * - Without one: "drop", the same rule as booking watches (5% and 10 units below
 *   the last price we told them about, or the first one we saw).
 */
export function fareAlert(
  w: { targetCents?: number; firstCents?: number; alertedCents?: number; lastCents?: number },
  nowCents: number,
): { kind: "target" | "drop"; wasCents: number } | null {
  if (w.targetCents !== undefined) {
    if (nowCents > w.targetCents) return null;
    if (w.alertedCents === undefined) return { kind: "target", wasCents: w.lastCents ?? w.firstCents ?? nowCents };
    return priceDrop({ alertedCents: w.alertedCents }, nowCents) ? { kind: "target", wasCents: w.alertedCents } : null;
  }
  const drop = priceDrop({ firstCents: w.firstCents, alertedCents: w.alertedCents }, nowCents);
  return drop ? { kind: "drop", wasCents: drop.wasCents } : null;
}

// ---------- Airports ----------

/**
 * Main airport for popular destinations, so the form starts filled in. Matched
 * against the trip's destination ("Tokyo & Kyoto, Japan" -> HND). The traveler
 * can always type another code.
 */
const CITY_AIRPORTS: [RegExp, string][] = [
  [/tokyo|東京/i, "HND"],
  [/kyoto|osaka|nara|大阪|京都/i, "KIX"],
  [/sapporo|hokkaido/i, "CTS"],
  [/okinawa|naha/i, "OKA"],
  [/seoul|서울|ソウル/i, "ICN"],
  [/busan/i, "PUS"],
  [/beijing|北京/i, "PEK"],
  [/shanghai|上海/i, "PVG"],
  [/hong kong|香港/i, "HKG"],
  [/taipei|台北/i, "TPE"],
  [/bangkok/i, "BKK"],
  [/phuket/i, "HKT"],
  [/chiang mai/i, "CNX"],
  [/singapore/i, "SIN"],
  [/bali|denpasar|ubud/i, "DPS"],
  [/hanoi/i, "HAN"],
  [/ho chi minh|saigon/i, "SGN"],
  [/manila/i, "MNL"],
  [/kuala lumpur/i, "KUL"],
  [/delhi/i, "DEL"],
  [/mumbai|bombay/i, "BOM"],
  [/dubai/i, "DXB"],
  [/abu dhabi/i, "AUH"],
  [/doha/i, "DOH"],
  [/istanbul/i, "IST"],
  [/cairo/i, "CAI"],
  [/marrakesh|marrakech/i, "RAK"],
  [/cape town/i, "CPT"],
  [/johannesburg/i, "JNB"],
  [/nairobi/i, "NBO"],
  [/sydney/i, "SYD"],
  [/melbourne/i, "MEL"],
  [/auckland/i, "AKL"],
  [/queenstown/i, "ZQN"],
  [/london|londres|londra/i, "LHR"],
  [/paris/i, "CDG"],
  [/rome|roma|rom\b/i, "FCO"],
  [/milan|milano|mailand/i, "MXP"],
  [/venice|venezia|venise|venedig/i, "VCE"],
  [/florence|firenze|florenz|tuscany/i, "FLR"],
  [/naples|napoli|amalfi/i, "NAP"],
  [/madrid/i, "MAD"],
  [/barcelona|barcelone/i, "BCN"],
  [/seville|sevilla/i, "SVQ"],
  [/lisbon|lisboa|lisbonne|lissabon/i, "LIS"],
  [/porto\b/i, "OPO"],
  [/amsterdam/i, "AMS"],
  [/brussels|bruxelles|brüssel/i, "BRU"],
  [/berlin/i, "BER"],
  [/munich|münchen|munique/i, "MUC"],
  [/frankfurt/i, "FRA"],
  [/vienna|wien|vienne|viena/i, "VIE"],
  [/prague|praha|prag/i, "PRG"],
  [/budapest/i, "BUD"],
  [/zurich|zürich/i, "ZRH"],
  [/geneva|genève|genf/i, "GVA"],
  [/copenhagen|københavn|kopenhagen/i, "CPH"],
  [/stockholm/i, "ARN"],
  [/oslo/i, "OSL"],
  [/helsinki/i, "HEL"],
  [/reykjavik|iceland/i, "KEF"],
  [/dublin/i, "DUB"],
  [/edinburgh/i, "EDI"],
  [/athens|athènes|atenas|athen/i, "ATH"],
  [/santorini/i, "JTR"],
  [/dubrovnik/i, "DBV"],
  [/new york|nyc|manhattan|brooklyn|nueva york/i, "JFK"],
  [/los angeles/i, "LAX"],
  [/san francisco/i, "SFO"],
  [/las vegas/i, "LAS"],
  [/miami/i, "MIA"],
  [/orlando/i, "MCO"],
  [/chicago/i, "ORD"],
  [/boston/i, "BOS"],
  [/washington|d\.c\./i, "IAD"],
  [/seattle/i, "SEA"],
  [/honolulu|hawaii|oahu/i, "HNL"],
  [/maui/i, "OGG"],
  [/new orleans/i, "MSY"],
  [/toronto/i, "YYZ"],
  [/vancouver/i, "YVR"],
  [/montreal|montréal/i, "YUL"],
  [/mexico city|ciudad de méxico|cdmx/i, "MEX"],
  [/cancun|cancún|tulum|playa del carmen/i, "CUN"],
  [/havana|la habana/i, "HAV"],
  [/punta cana|bávaro|bavaro/i, "PUJ"],
  // Dominican towns whose names contain a bigger city's ("Río San Juan", "Santiago de los Caballeros").
  [/puerto plata|sos[uú]a|cabarete|r[ií]o san juan|cabrera/i, "POP"],
  [/saman[aá]|las terrenas|las galeras/i, "AZS"],
  [/santiago de los caballeros/i, "STI"],
  [/la romana|bayah[ií]be/i, "LRM"],
  [/santo domingo|dominican republic|rep[uú]blica dominicana/i, "SDQ"],
  [/santiago de compostela/i, "SCQ"],
  [/san juan|puerto rico/i, "SJU"],
  [/bogotá|bogota/i, "BOG"],
  [/medellín|medellin/i, "MDE"],
  [/cartagena/i, "CTG"],
  [/lima\b|cusco|cuzco|machu picchu/i, "LIM"],
  [/rio de janeiro/i, "GIG"],
  [/são paulo|sao paulo/i, "GRU"],
  [/buenos aires/i, "EZE"],
  [/santiago/i, "SCL"],
];

export function guessAirport(destination: string): string | undefined {
  return CITY_AIRPORTS.find(([re]) => re.test(destination))?.[1];
}

// ---------- Demo provider (ALERTS_DEMO=true) ----------

/** A made-up round-trip fare that drifts down ~6% a check, cheaper mid-week, so everything can be tried without a key. */
export function demoFare(seed: string, checks: number, shiftDays = 0): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const base = 45000 + (h % 60000);
  const wobble = [1.12, 0.94, 1.03, 1, 0.9, 1.07, 1.15][(shiftDays + 3 + (h % 7)) % 7]!;
  return Math.round(base * wobble * Math.pow(0.94, checks));
}

export function demoOffers(cents: number, from: string, to: string, date: string): FareOffer[] {
  return [
    { airline: "Demo Air", flightNumbers: "DA 101", depDate: date, depTime: "09:15", arrDate: date, arrTime: "17:40", stops: 0, durationMinutes: 505, cents },
    { airline: "Sample Airways", flightNumbers: "SA 22 · SA 908", depDate: date, depTime: "13:05", arrDate: shiftDate(date, 1), arrTime: "06:20", stops: 1, durationMinutes: 795, cents: cents + 4200 },
    { airline: "Test Jet", flightNumbers: `TJ ${from.charCodeAt(0)}${to.charCodeAt(0)}`, depDate: date, depTime: "22:30", arrDate: shiftDate(date, 1), arrTime: "07:05", stops: 0, durationMinutes: 515, cents: cents + 9800 },
  ];
}

export function demoInsights(cents: number, now: number): FareInsights {
  return {
    level: "typical",
    typicalLowCents: Math.round((cents * 0.85) / 100) * 100,
    typicalHighCents: Math.round((cents * 1.2) / 100) * 100,
    history: Array.from({ length: 30 }, (_, i) => ({ at: now - (29 - i) * DAY, cents: Math.round(cents * (1.1 - 0.004 * i + 0.03 * Math.sin(i / 2))) })),
  };
}
