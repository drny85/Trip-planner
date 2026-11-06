import type { BookingKind } from "./bookings";
import { CATEGORIES, type Category } from "./categories";
import type { ActivityNode } from "./tree";

/**
 * The trip budget overview: what was planned against what was spent, by category
 * and by day, from everything that costs money on a trip:
 *
 * - itinerary: activity estimates (planned) and actual costs (spent), per person,
 *   in the trip's currency;
 * - shared costs: logged expenses (spent), in the trip's group currency;
 * - bookings with a known price (planned and spent: it's paid);
 * - fare watches for flights not booked yet (planned, at today's cheapest fare).
 *
 * Pure, so web and mobile work it out from data they already have, in whichever
 * currency they show, and tests need no database.
 *
 * Two rules keep things from being counted twice:
 * - A priced booking linked to an activity replaces that activity's own figures.
 * - A checked-off activity without an actual cost counts its estimate as spent only
 *   while the trip has no logged shared costs. Once the group logs real spending,
 *   that's what "spent" is.
 */

export type BudgetScope = "me" | "group";
export type BudgetSource = "itinerary" | "shared" | "bookings" | "flights";
export type Line = { planned: number; spent: number };

/** What `budget.overview` returns besides the trip itself. Cents are whole-booking or whole-expense. */
export type OverviewExtras = {
  /** Everyone on the trip, at least 1. Per-person costs are multiplied by it for the group. */
  travelers: number;
  expenses: { _id: string; description: string; category: Category; date: string; currency: string; totalCents: number; myShareCents: number }[];
  bookings: { _id: string; kind: BookingKind; title: string; activityId?: string; date?: string; cents: number; currency: string; people: number }[];
  fares: { _id: string; isMine: boolean; date: string; cents: number; currency: string; people: number }[];
};

export type OverviewTrip = {
  startDate: string;
  endDate: string;
  /** What activity costs are in. */
  currency?: string;
  subTrips: { _id: string; title: string; dayNumber: number; date?: string; activities: ActivityNode[] }[];
};

export type DayKey = "before" | "after" | string;
export type BudgetOverview = {
  total: Line;
  byCategory: ({ category: Category } & Line)[];
  /** "before" (things paid or dated before the trip), each day by subTripId, then "after". Empty buckets are left out. */
  byDay: ({ key: DayKey; dayNumber?: number; title?: string; date?: string } & Line)[];
  bySource: ({ source: BudgetSource } & Line)[];
  /** Currencies with no rate into the display currency; their amounts are left out. */
  missingRates: string[];
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "2027-04-02" plus n days. */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Each day's date: its own, or the trip start plus its day number. */
function dayDates(trip: OverviewTrip) {
  return trip.subTrips.map((s) => ({ ...s, date: s.date && ISO.test(s.date) ? s.date : ISO.test(trip.startDate) ? addDays(trip.startDate, s.dayNumber - 1) : undefined }));
}

/** The bucket a date falls in: before or after the trip, else the last day starting on or before it. */
export function dayFor(date: string | undefined, trip: OverviewTrip): DayKey | undefined {
  if (!date || !ISO.test(date)) return undefined;
  if (date < trip.startDate) return "before";
  if (date > trip.endDate) return "after";
  const days = dayDates(trip).filter((d) => d.date);
  const on = days.filter((d) => d.date! <= date);
  return (on.at(-1) ?? days[0])?._id;
}

const KEYWORDS: [Category, RegExp][] = [
  ["lodging", /hotel|hostel|airbnb|motel|resort|lodg|stay|room|ryokan|alojamiento|hospedaje|hôtel|hébergement|pousada|hospedagem|unterkunft|zimmer|ホテル|宿/i],
  ["transport", /taxi|uber|lyft|cab|bus|train|metro|subway|tube|tram|ferry|flight|plane|airline|gas|fuel|petrol|parking|toll|car rental|rental car|transport|ticket.*(train|bus)|avión|vuelo|tren|gasolina|estacionamiento|peaje|vol|essence|péage|voo|ônibus|combustível|flug|zug|tankstelle|benzin|maut|タクシー|電車|新幹線|バス|駐車/i],
  ["food", /food|dinner|lunch|breakfast|brunch|meal|restaurant|cafe|café|coffee|snack|grocer|supermarket|bakery|pizza|sushi|ramen|tacos?|comida|cena|almuerzo|desayuno|restaurante|dîner|déjeuner|repas|jantar|almoço|mercado|essen|abendessen|mittagessen|frühstück|lebensmittel|食|ランチ|ディナー|カフェ/i],
  ["nightlife", /bar\b|bars\b|club|drinks?|beer|wine|cocktail|pub|concert|show|cerveza|vino|copas|boîte|bière|cerveja|bier|kneipe|konzert|居酒屋|バー|ビール/i],
  ["sightseeing", /museum|tour|entry|entrance|admission|ticket|temple|castle|guide|museo|entrada|boleto|musée|billet|visite|ingresso|museu|eintritt|führung|museen|博物館|美術館|入場|寺|神社/i],
  ["shopping", /shop|souvenir|gift|clothes|market|mall|store|tienda|regalo|recuerdo|boutique|cadeau|lembrança|loja|geschenk|einkauf|お土産|買い物/i],
  ["nature", /park|beach|hike|trail|garden|snorkel|surf|kayak|parque|playa|plage|jardin|praia|trilha|strand|wanderung|garten|公園|ビーチ/i],
];

/** A best guess at what an expense was for, from its description ("Taxi to the airport" → transport). */
export function guessCategory(description: string): Category {
  return KEYWORDS.find(([, re]) => re.test(description))?.[0] ?? "other";
}

/** What a booking counts as in the budget. */
export const bookingCategory = (kind: BookingKind): Category => BOOKING_CATEGORY[kind];

/** Same as CATEGORY_FOR in lib/bookings.ts (a test keeps them equal), without pulling its deps into the apps. */
export const BOOKING_CATEGORY: Record<BookingKind, Category> = {
  flight: "transport",
  train: "transport",
  bus: "transport",
  ferry: "transport",
  car: "transport",
  hotel: "lodging",
  restaurant: "food",
  tour: "sightseeing",
  event: "nightlife",
  other: "other",
};

export function budgetOverview({
  trip,
  extras,
  scope,
  display,
  rates,
}: {
  trip: OverviewTrip;
  /** Missing on a shared, read-only trip: only the itinerary counts. */
  extras: OverviewExtras | null;
  scope: BudgetScope;
  /** The currency every amount comes back in. */
  display: string;
  /** How many `display` one unit of each other currency buys. */
  rates: Record<string, number>;
}): BudgetOverview {
  const travelers = Math.max(1, extras?.travelers ?? 1);
  const missing = new Set<string>();
  const convert = (amount: number, currency: string): number | null => {
    if (currency === display) return amount;
    const rate = rates[currency];
    if (!rate || !Number.isFinite(rate)) {
      missing.add(currency);
      return null;
    }
    return amount * rate;
  };

  const total: Line = { planned: 0, spent: 0 };
  const cats = new Map<Category, Line>();
  const days = new Map<DayKey, Line>();
  const sources = new Map<BudgetSource, Line>();
  const bump = (map: Map<string, Line>, key: string, planned: number, spent: number) => {
    const line = map.get(key) ?? { planned: 0, spent: 0 };
    line.planned += planned;
    line.spent += spent;
    map.set(key, line);
  };
  const count = (source: BudgetSource, category: Category, day: DayKey | undefined, currency: string, planned: number, spent: number) => {
    const p = convert(planned, currency);
    const s = convert(spent, currency);
    if (p == null || s == null) return;
    total.planned += p;
    total.spent += s;
    bump(cats as Map<string, Line>, category, p, s);
    bump(sources as Map<string, Line>, source, p, s);
    if (day) bump(days, day, p, s);
  };

  // Bookings first: a priced booking stands in for the activity it's linked to.
  const replaced = new Set<string>();
  for (const b of extras?.bookings ?? []) {
    if (!(b.cents > 0)) continue;
    if (b.activityId) replaced.add(b.activityId);
    const amount = b.cents / 100 / (scope === "me" ? Math.max(1, b.people) : 1);
    count("bookings", bookingCategory(b.kind), dayFor(b.date, trip), b.currency, amount, amount);
  }

  // The itinerary, per person (times everyone for the group).
  const tripCurrency = trip.currency ?? display;
  const perPerson = scope === "me" ? 1 : travelers;
  const estimateDone = !extras?.expenses.length;
  const hasCost = (n: ActivityNode): boolean => n.estimatedCost != null || n.actualCost != null || n.children.some(hasCost);
  const costed = (nodes: ActivityNode[]): ActivityNode[] =>
    nodes.flatMap((n) => (replaced.has(n._id) ? [] : n.children.some(hasCost) ? costed(n.children) : hasCost(n) ? [n] : []));
  for (const day of trip.subTrips) {
    for (const n of costed(day.activities)) {
      const estimated = n.estimatedCost ?? 0;
      const spent = n.actualCost ?? (n.isCompleted && estimateDone ? estimated : 0);
      count("itinerary", n.category ?? "other", day._id, tripCurrency, estimated * perPerson, spent * perPerson);
    }
  }

  // Shared costs: your share, or what the group paid.
  for (const e of extras?.expenses ?? []) {
    const cents = scope === "me" ? e.myShareCents : e.totalCents;
    if (cents <= 0) continue;
    count("shared", e.category, dayFor(e.date, trip) ?? "before", e.currency, 0, cents / 100);
  }

  // Flights not booked yet, at today's fare.
  for (const f of extras?.fares ?? []) {
    if (scope === "me" && !f.isMine) continue;
    if (!(f.cents > 0)) continue;
    const amount = f.cents / 100 / (scope === "me" ? Math.max(1, f.people) : 1);
    count("flights", "transport", dayFor(f.date, trip) ?? "before", f.currency, amount, 0);
  }

  const dated = dayDates(trip);
  const byDay: BudgetOverview["byDay"] = [];
  const push = (key: DayKey, extra: { dayNumber?: number; title?: string; date?: string } = {}) => {
    const line = days.get(key);
    if (line && (line.planned || line.spent)) byDay.push({ key, ...extra, ...line });
  };
  push("before");
  for (const d of dated) push(d._id, { dayNumber: d.dayNumber, title: d.title, date: d.date });
  push("after");

  const ORDER: BudgetSource[] = ["itinerary", "bookings", "shared", "flights"];
  return {
    total,
    byCategory: CATEGORIES.filter((c) => cats.has(c))
      .map((category) => ({ category, ...cats.get(category)! }))
      .filter((c) => c.planned || c.spent)
      .sort((a, b) => Math.max(b.planned, b.spent) - Math.max(a.planned, a.spent)),
    byDay,
    bySource: ORDER.filter((s) => sources.has(s)).map((source) => ({ source, ...sources.get(source)! })),
    missingRates: [...missing].sort(),
  };
}

/** The currencies a page needs rates for to show the overview in `display`. */
export function currenciesIn(trip: Pick<OverviewTrip, "currency">, extras: OverviewExtras | null, display: string): string[] {
  const all = new Set<string>([trip.currency ?? display]);
  for (const e of extras?.expenses ?? []) all.add(e.currency);
  for (const b of extras?.bookings ?? []) all.add(b.currency);
  for (const f of extras?.fares ?? []) all.add(f.currency);
  all.delete(display);
  return [...all].sort();
}
