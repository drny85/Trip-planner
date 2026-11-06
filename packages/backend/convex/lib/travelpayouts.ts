import type { FareInsights, FareOffer } from "./fares";

/**
 * Travelpayouts' Aviasales Data API: free fares that Aviasales users found in
 * the last 48 hours (docs: support.travelpayouts.com/hc/en-us/articles/203956163).
 * Prices are cached on their side, so they're "from" prices, not live quotes,
 * and they're per passenger. Booking goes to Aviasales through an affiliate link.
 * Everything here is pure; convex/fares.ts does the fetching and caching.
 */

export const TP_API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
/** Travelpayouts' program id for Aviasales in tp.media affiliate links. */
export const AVIASALES_PROGRAM = "4114";

type TpTicket = {
  price?: number;
  airline?: string;
  flight_number?: string | number;
  departure_at?: string;
  return_at?: string;
  transfers?: number;
  duration_to?: number;
  duration?: number;
  link?: string;
};
export type TpResponse = { success?: boolean; error?: string; data?: TpTicket[] };

/** "2027-04-02T11:40:00-07:00" -> ["2027-04-02", "11:40"], the local time as given. */
const localParts = (s?: string): [string, string] | null => {
  const m = s?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? [m[1]!, m[2]!] : null;
};

/** The URL params for one exact search. `token` goes in a header, not here. */
export function tpParams(w: { from: string; to: string; outboundDate: string; returnDate?: string; currency: string }, market = "us") {
  const p = new URLSearchParams({
    origin: w.from,
    destination: w.to,
    departure_at: w.outboundDate,
    currency: w.currency.toLowerCase(),
    market,
    sorting: "price",
    limit: "30",
    one_way: w.returnDate ? "false" : "true",
  });
  if (w.returnDate) p.set("return_at", w.returnDate);
  return p;
}

/**
 * The cheapest fare for everyone (per-passenger price x adults) and the 3
 * cheapest tickets for these exact dates. Null when nobody searched them lately.
 */
export function parseTp(res: TpResponse, w: { outboundDate: string; returnDate?: string; adults: number }): { cents: number; offers: FareOffer[] } | null {
  const tickets = (res.data ?? []).filter(
    (t) =>
      typeof t.price === "number" &&
      t.price > 0 &&
      t.departure_at?.startsWith(w.outboundDate) &&
      (!w.returnDate || !t.return_at || t.return_at.startsWith(w.returnDate)),
  );
  if (!tickets.length) return null;
  tickets.sort((a, b) => a.price! - b.price!);
  const offers: FareOffer[] = [];
  for (const t of tickets) {
    const dep = localParts(t.departure_at);
    if (!dep) continue;
    const airline = (t.airline ?? "").toUpperCase().slice(0, 3);
    offers.push({
      airline: airline || "—",
      logo: /^[A-Z0-9]{2}$/.test(airline) ? `https://pics.avs.io/60/60/${airline}.png` : undefined,
      flightNumbers: airline && t.flight_number ? `${airline} ${t.flight_number}` : "",
      depDate: dep[0],
      depTime: dep[1],
      stops: Math.max(0, Math.round(t.transfers ?? 0)),
      durationMinutes: Math.max(0, Math.round(t.duration_to ?? t.duration ?? 0)),
      cents: Math.round(t.price! * 100) * w.adults,
    });
    if (offers.length === 3) break;
  }
  return { cents: Math.round(tickets[0]!.price! * 100) * w.adults, offers };
}

/**
 * "Usual" price for this route around these dates, from the cheapest fare of
 * each day in the ±3 day grid plus today's: the 25th to 75th percentile. Tells
 * whether today's fare is low, typical or high, like Google's price level.
 */
export function insightsFromGrid(cents: number, nearby: (number | undefined)[]): FareInsights | undefined {
  const prices = [...nearby.filter((c): c is number => typeof c === "number"), cents].sort((a, b) => a - b);
  if (prices.length < 4) return undefined;
  const at = (q: number) => prices[Math.min(prices.length - 1, Math.max(0, Math.round(q * (prices.length - 1))))]!;
  const low = at(0.25);
  const high = at(0.75);
  return { level: cents <= low ? "low" : cents >= high && high > low ? "high" : "typical", typicalLowCents: low, typicalHighCents: high, history: [] };
}

/** "2027-04-02" -> "0204", Aviasales' day-month format. */
const ddmm = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}`;

/** Aviasales results for this search: /search/SFO0204HND08042 (2 adults). */
export function aviasalesUrl(from: string, to: string, outboundDate: string, returnDate: string | undefined, adults: number) {
  return `https://www.aviasales.com/search/${from}${ddmm(outboundDate)}${to}${returnDate ? ddmm(returnDate) : ""}${Math.min(9, Math.max(1, adults))}`;
}

/** The affiliate version of a link, so bookings through it earn the commission. */
export function affiliateUrl(url: string, marker: string | undefined, program = AVIASALES_PROGRAM) {
  if (!marker) return url;
  return `https://tp.media/r?${new URLSearchParams({ marker, p: program, u: url })}`;
}
