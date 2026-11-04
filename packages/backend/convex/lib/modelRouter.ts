/**
 * Picks the cheapest model that can handle a trip request, so short simple trips
 * don't pay frontier-model prices. Pure and synchronous (no extra LLM call): it
 * reads the trip length and how many places the request spans.
 *
 *   simple   ≤ 3 days, one place, short request
 *   standard everything in between
 *   complex  8+ days, several cities, road trips, long detailed requests
 *
 * Through the Vercel AI Gateway each tier is a list of models from any provider:
 * the first is tried first and the rest are the gateway's fallbacks, in order.
 * Directly against the Anthropic API, each tier is one Claude model.
 */

export type Tier = "simple" | "standard" | "complex";
export type Via = "anthropic" | "gateway";

export const TIERS: readonly Tier[] = ["simple", "standard", "complex"];

const MODELS: Record<Via, Record<Tier, readonly string[]>> = {
  // Mixed providers: a cheap fast model for weekends, strong mid-tier models for
  // typical trips, frontier models for long multi-city planning.
  gateway: {
    simple: ["google/gemini-3.6-flash", "anthropic/claude-haiku-5.5"],
    standard: ["anthropic/claude-sonnet-5.5", "google/gemini-3.1-pro-preview"],
    complex: ["anthropic/claude-opus-5.5", "openai/gpt-6-astra"],
  },
  anthropic: {
    simple: ["claude-haiku-5-5"],
    standard: ["claude-sonnet-5-5"],
    complex: ["claude-opus-5-5"],
  },
};

/** Output budget per tier: a long multi-city trip needs more room than a weekend. */
export const MAX_TOKENS: Record<Tier, number> = { simple: 8000, standard: 16000, complex: 16000 };

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30,
};

const toNumber = (word: string) => (/^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word]);

/** Best guess at the trip length in days, or null when the request doesn't say. */
export function estimateDays(request: string): number | null {
  const text = request.toLowerCase();
  const num = "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|twenty|thirty)";
  let best: number | null = null;
  const consider = (days: number | undefined) => {
    if (days && days > 0 && days < 366) best = Math.max(best ?? 0, days);
  };

  for (const m of text.matchAll(new RegExp(`\\b${num}[-\\s]+(day|night)s?\\b`, "g"))) consider(toNumber(m[1]!));
  for (const m of text.matchAll(new RegExp(`\\b${num}[-\\s]+weeks?\\b`, "g"))) consider((toNumber(m[1]!) ?? 0) * 7);
  for (const m of text.matchAll(new RegExp(`\\b${num}[-\\s]+months?\\b`, "g"))) consider((toNumber(m[1]!) ?? 0) * 30);
  if (/\bfortnight\b/.test(text)) consider(14);
  if (/\b(long )?weekend\b/.test(text)) consider(/\blong weekend\b/.test(text) ? 3 : 2);
  if (/\b(day trip|overnight)\b/.test(text)) consider(1);
  return best;
}

/** Signals that the trip spans several places, which needs more planning. */
export function countPlaceSignals(request: string): number {
  const text = request.toLowerCase();
  let signals = 0;
  if (/\b(road[- ]?trip(ping|s)?|multi[- ]?city|multi[- ]?country|backpack(ing)?|island[- ]hopping|cross[- ]country|tour of)\b/.test(text)) signals += 2;
  signals += (text.match(/->|→|\bthen\b|\bfollowed by\b/g) ?? []).length;
  // "Rome, Florence and Venice": each extra capitalized place after a comma or "and".
  signals += (request.match(/(?:,|\band\b)\s+[A-Z][a-zà-ÿ]+/g) ?? []).length;
  return signals;
}

export function classifyRequest(request: string): { tier: Tier; days: number | null; placeSignals: number } {
  const days = estimateDays(request);
  const placeSignals = countPlaceSignals(request);
  const long = request.length > 600;

  let tier: Tier = "standard";
  if ((days ?? 0) >= 8 || placeSignals >= 2 || long) tier = "complex";
  else if (days !== null && days <= 3 && placeSignals === 0 && request.length <= 300) tier = "simple";
  return { tier, days, placeSignals };
}

/** One tier up, for a retry when a cheaper model's answer was cut off or incomplete. */
export const nextTier = (tier: Tier): Tier | null => TIERS[TIERS.indexOf(tier) + 1] ?? null;

const parseList = (value: string) => value.split(",").map((m) => m.trim()).filter(Boolean);

/**
 * Models for a tier, primary first. Env overrides (comma-separated lists), checked in order:
 *   AI_MODEL            one model list for every request (turns routing off)
 *   AI_MODEL_SIMPLE / AI_MODEL_STANDARD / AI_MODEL_COMPLEX   per-tier lists
 * e.g. AI_MODEL_SIMPLE="google/gemini-3.6-flash,openai/gpt-6-astra"
 */
export function modelsFor(tier: Tier, via: Via, env: Record<string, string | undefined> = process.env): string[] {
  const override = env.AI_MODEL || env[`AI_MODEL_${tier.toUpperCase()}`];
  const list = override ? parseList(override) : [...MODELS[via][tier]];
  // The direct Anthropic API takes one model per request.
  return via === "anthropic" ? list.slice(0, 1) : list;
}

/** Server-side refusal fallback exists on the direct API for Opus and Sonnet, not Haiku. */
export const supportsServerFallback = (via: Via, model: string) => via === "anthropic" && !/haiku/i.test(model);
