/**
 * The guided trip interview on Plan with AI: a few skippable, tap-to-answer steps
 * instead of a blank prompt. Client-safe (no zod), shared by web, mobile and the
 * backend, which turns the answers into exact planning rules (see `preferenceRules`).
 */

export const TRIP_LENGTHS = [2, 3, 5, 7, 10, 14] as const;
export const TRAVELERS = ["solo", "couple", "family", "friends"] as const;
export const BUDGETS = ["budget", "moderate", "luxury"] as const;
/** How full the days should be. */
export const PACES = ["packed", "balanced", "relaxed", "freeDays"] as const;
export const INTERESTS = [
  "food",
  "culture",
  "history",
  "art",
  "nature",
  "beaches",
  "adventure",
  "nightlife",
  "shopping",
  "wellness",
  "hiddenGems",
  "kids",
] as const;

export type Travelers = (typeof TRAVELERS)[number];
export type Budget = (typeof BUDGETS)[number];
export type Pace = (typeof PACES)[number];
export type Interest = (typeof INTERESTS)[number];

export type TripPreferences = {
  destination: string;
  /** Trip length in days. */
  days?: number;
  /** "YYYY-MM" month they're going, or undefined for flexible. */
  month?: string;
  travelers?: Travelers;
  budget?: Budget;
  pace?: Pace;
  interests?: Interest[];
  /** Anything else, in their own words. */
  notes?: string;
};

export const INTERVIEW_STEPS = ["where", "when", "who", "pace", "interests"] as const;
export type InterviewStep = (typeof INTERVIEW_STEPS)[number];

/** Emoji for each interest chip and pace card. */
export const INTEREST_EMOJI: Record<Interest, string> = {
  food: "🍜",
  culture: "🎭",
  history: "🏛️",
  art: "🎨",
  nature: "🌿",
  beaches: "🏖️",
  adventure: "🧗",
  nightlife: "🌙",
  shopping: "🛍️",
  wellness: "🧖",
  hiddenGems: "💎",
  kids: "🧸",
};
export const PACE_EMOJI: Record<Pace, string> = { packed: "⚡", balanced: "⚖️", relaxed: "🌤️", freeDays: "🏝️" };
export const TRAVELER_EMOJI: Record<Travelers, string> = { solo: "🧍", couple: "💑", family: "👨‍👩‍👧", friends: "👯" };
export const BUDGET_EMOJI: Record<Budget, string> = { budget: "💸", moderate: "💳", luxury: "💎" };

/** The next `count` months as "YYYY-MM", starting with next month. */
export function upcomingMonths(count = 6, from = new Date()): string[] {
  const months: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/** Answers as they arrive from a client, before they're checked. */
export type RawPreferences = { [K in keyof TripPreferences]?: K extends "interests" ? string[] : K extends "days" ? number : string } & { destination: string };

/** Drops anything that isn't a known answer, so the server can trust the shape. */
export function cleanPreferences(p: RawPreferences): TripPreferences {
  const pick = <T extends string>(list: readonly T[], value: unknown) => (list as readonly unknown[]).includes(value) ? (value as T) : undefined;
  const days = typeof p.days === "number" && p.days >= 1 && p.days <= 60 ? Math.round(p.days) : undefined;
  return {
    destination: p.destination.trim().slice(0, 200),
    days,
    month: typeof p.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p.month) ? p.month : undefined,
    travelers: pick(TRAVELERS, p.travelers),
    budget: pick(BUDGETS, p.budget),
    pace: pick(PACES, p.pace),
    interests: [...new Set((p.interests ?? []).filter((i): i is Interest => (INTERESTS as readonly string[]).includes(i)))],
    notes: p.notes?.trim().slice(0, 800) || undefined,
  };
}

const PACE_RULES: Record<Pace, string> = {
  packed:
    "Packed days: plan full days from morning to evening, about 5 to 7 stops a day including meals, with efficient routing so little time is lost.",
  balanced:
    "Balanced days: about 3 to 5 stops a day including meals, with a slower break in the afternoon and evenings that end at a reasonable time.",
  relaxed:
    'Relaxed days: only 2 or 3 planned stops a day plus meals, starting no earlier than 10:00. Every day, add one activity titled as free time (category "other", e.g. "Free afternoon to wander or rest") that lasts 2 to 4 hours, so the free time is visible and real. Never squeeze extra sights into that time.',
  freeDays:
    'Some days completely free: make roughly one in every three days (at least one day on trips of 3 days or more, never the first day) a free day with no plans. A free day has exactly one activity: a free-time block (category "other", titled e.g. "Free day: no plans") with a short description of easy optional ideas nearby. The other days are balanced (3 to 5 stops). Say "Free day" in that day\'s title.',
};

const TRAVELER_RULES: Record<Travelers, string> = {
  solo: "Traveling solo: favour safe, social, walkable areas and places that are good alone.",
  couple: "A couple: include a few romantic or special meals and views.",
  family: "A family with children: kid-friendly places, shorter walks, earlier dinners, breaks between sights.",
  friends: "A group of friends: lively places, group-friendly restaurants, some nightlife unless they said otherwise.",
};

const BUDGET_RULES: Record<Budget, string> = {
  budget: "Budget: cheap eats, free sights and public transport; avoid expensive places.",
  moderate: "Moderate budget: good-value restaurants and paid sights where worth it.",
  luxury: "Luxury budget: top restaurants, premium experiences and private tours where they add something.",
};

const INTEREST_NAMES: Record<Interest, string> = {
  food: "food and local dishes",
  culture: "local culture and traditions",
  history: "history and landmarks",
  art: "art, museums and galleries",
  nature: "nature, parks and hikes",
  beaches: "beaches and the water",
  adventure: "adventure and outdoor activities",
  nightlife: "nightlife, bars and live music",
  shopping: "shopping and markets",
  wellness: "wellness, spas and slow time",
  hiddenGems: "hidden gems away from the crowds",
  kids: "kid-friendly activities",
};

/**
 * The interview answers as exact rules for the planner, in English (the model's
 * working language; the itinerary is still written in the app language).
 */
export function preferenceRules(p: TripPreferences): string {
  const lines = [`Destination: ${p.destination}.`];
  if (p.days) lines.push(`Length: exactly ${p.days} day${p.days === 1 ? "" : "s"}, one sub-trip per day.`);
  if (p.month) lines.push(`When: in ${p.month} (YYYY-MM). Pick sensible dates in that month and plan for that season's weather and opening hours.`);
  else lines.push("Dates: flexible.");
  if (p.travelers) lines.push(TRAVELER_RULES[p.travelers]);
  if (p.budget) lines.push(BUDGET_RULES[p.budget]);
  lines.push(PACE_RULES[p.pace ?? "balanced"]);
  if (p.interests?.length) lines.push(`Activity types they want, weight the plan toward these: ${p.interests.map((i) => INTEREST_NAMES[i]).join("; ")}.`);
  if (p.notes) lines.push(`In their own words: ${p.notes}`);
  return lines.map((l) => `- ${l}`).join("\n");
}

/** Translation hooks the summary needs; methods, so the apps' typed `t` fits. */
export type SummaryText = { t(key: string, vars?: Record<string, string | number>): string; month(ym: string): string };

/** The answers as short labelled parts in the app language, e.g. ["Lisbon", "5 days", "May 2027", "Couple", …]. */
export function summaryParts(p: TripPreferences, { t, month }: SummaryText): string[] {
  const parts = [p.destination.trim()];
  if (p.days) parts.push(t("interview.days", { count: p.days }));
  if (p.month) parts.push(month(p.month));
  if (p.travelers) parts.push(t(`interview.${p.travelers}`));
  if (p.budget) parts.push(t(`interview.${p.budget}`));
  if (p.pace) parts.push(t(`interview.${p.pace}`));
  if (p.interests?.length) parts.push(p.interests.map((i) => t(`interview.${i}`)).join(", "));
  return parts.filter(Boolean);
}

/** The request saved with the trip (and shown while planning): the summary plus their own notes. */
export function summaryPrompt(p: TripPreferences, text: SummaryText): string {
  const line = summaryParts(p, text).join(" · ");
  return (p.notes ? `${line}\n${p.notes.trim()}` : line).slice(0, 2000);
}
