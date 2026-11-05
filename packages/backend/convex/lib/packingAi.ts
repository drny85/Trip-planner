import { z } from "zod";
import { isPackingCategory, PACKING_CATEGORIES, type PackingCategory } from "./packingCategories";

export { PACKING_CATEGORIES, type PackingCategory } from "./packingCategories";

/**
 * AI packing list: the schema the model fills in, the weather it's given, and
 * the pure helpers around them. The action that ties them together is
 * `ai.generatePackingList`.
 */

/** Most AI generations a trip gets per day, so a button can't run up the bill. */
export const MAX_RUNS_PER_DAY = 10;
/** Largest list the model may return. */
export const MAX_AI_ITEMS = 45;

// Structured outputs can't enforce enums reliably, so the schema stays loose and
// `cleanItems` normalizes what comes back instead of rejecting the whole list.
export const packingSchema = z.object({
  items: z
    .array(
      z.object({
        text: z.string().describe('Short item name, e.g. "Hiking shoes" or "Type A plug adapter"'),
        category: z.string().describe(`One of: ${PACKING_CATEGORIES.join(", ")}`),
        quantity: z.number().optional().describe("How many per person, only when more than one makes sense (e.g. 5 pairs of socks)"),
        reason: z.string().describe('Why this trip needs it, in a few words, e.g. "Mt. Takao hike on day 3" or "Rain on 2 days"'),
        group: z.boolean().describe("True for one-per-group things someone can bring for everyone (first-aid kit, sunscreen, power bank)"),
      }),
    )
    .describe(`Up to ${MAX_AI_ITEMS} items, most important first`),
});
export type GeneratedPacking = z.infer<typeof packingSchema>;

export type CleanItem = { text: string; category: PackingCategory; quantity?: number; reason?: string; isGroupItem: boolean };

export const PACKING_PROMPT = `You are an expert travel packer. Write the packing list for one trip.

- Base it on three things: the destination (plug type, local customs, dress codes for temples or churches, local currency), the weather, and the planned activities (hiking shoes for a hike, swimwear for the beach, a smart outfit for a fancy dinner).
- Give every item a short reason that names what it's for, such as the activity and its day, or the weather. Skip generic filler that any trip needs unless the reason is specific to this one.
- Size the clothing quantities to the trip length, and assume laundry is possible on trips over a week.
- Don't repeat anything that's already on the list, even if it's worded differently.
- Mark one-per-group items (first-aid kit, sunscreen, a travel power strip) as group items when more than one person is going.`;

/** Normalized text for spotting duplicates: "Sun-screen " and "sunscreen" match. */
export const itemKey = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** Cleans up the model's items and drops anything already on the list (or repeated). */
export function cleanItems(generated: GeneratedPacking["items"], existing: string[]): CleanItem[] {
  const seen = new Set(existing.map(itemKey));
  const out: CleanItem[] = [];
  for (const item of generated) {
    const text = item.text.trim().replace(/\s+/g, " ").slice(0, 120);
    const key = itemKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const category = item.category.trim().toLowerCase();
    const quantity = item.quantity != null && Number.isFinite(item.quantity) ? Math.round(item.quantity) : undefined;
    const reason = item.reason.trim().replace(/\s+/g, " ").slice(0, 140);
    out.push({
      text,
      category: isPackingCategory(category) ? category : "other",
      quantity: quantity && quantity > 1 ? Math.min(quantity, 30) : undefined,
      reason: reason || undefined,
      isGroupItem: item.group,
    });
    if (out.length >= MAX_AI_ITEMS) break;
  }
  return out;
}

/* ---------------------------------- Weather --------------------------------- */

/**
 * The weather the list is packed for. Open-Meteo (free, no key) forecasts 16 days
 * ahead; for trips further out, the same dates last year stand in as typical weather.
 */
export type TripWeather = {
  source: "forecast" | "lastYear";
  days: number;
  high: number;
  low: number;
  rainyDays: number;
  snowyDays: number;
};

const DAY_MS = 86_400_000;
const FORECAST_DAYS = 16;
/** Long trips only need the first month to see the weather pattern. */
const MAX_WEATHER_DAYS = 31;

const toDate = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Open-Meteo request for a trip's dates, or null when the dates can't be used. */
export function weatherRequest(latitude: number, longitude: number, startDate: string, endDate: string, today: string) {
  const start = toDate(startDate);
  const now = toDate(today);
  if (Number.isNaN(start) || Number.isNaN(now)) return null;
  const end = Math.min(Math.max(toDate(endDate) || start, start), start + (MAX_WEATHER_DAYS - 1) * DAY_MS);
  if (end < now) return null; // The trip is over.

  const coords = { latitude: latitude.toFixed(3), longitude: longitude.toFixed(3), timezone: "auto" };
  if (start <= now + (FORECAST_DAYS - 1) * DAY_MS) {
    const from = Math.max(start, now);
    const to = Math.min(end, now + (FORECAST_DAYS - 1) * DAY_MS);
    const params = new URLSearchParams({
      ...coords,
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      start_date: toIso(from),
      end_date: toIso(to),
    });
    return { source: "forecast" as const, url: `https://api.open-meteo.com/v1/forecast?${params}` };
  }
  const lastYear = (ms: number) => {
    const d = new Date(ms);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return toIso(d.getTime());
  };
  const params = new URLSearchParams({
    ...coords,
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum",
    start_date: lastYear(start),
    end_date: lastYear(end),
  });
  return { source: "lastYear" as const, url: `https://archive-api.open-meteo.com/v1/archive?${params}` };
}

const nums = (list: unknown): number[] => (Array.isArray(list) ? list.filter((n): n is number => typeof n === "number") : []);

/** Sums up Open-Meteo's daily response into the trip's range of weather. */
export function summarizeWeather(json: unknown, source: TripWeather["source"]): TripWeather | null {
  const daily = (json as { daily?: Record<string, unknown> } | null)?.daily;
  if (!daily) return null;
  const highs = nums(daily.temperature_2m_max);
  const lows = nums(daily.temperature_2m_min);
  if (!highs.length || !lows.length) return null;
  const codes = nums(daily.weather_code);
  const isSnowCode = (c: number) => (c >= 71 && c <= 77) || c === 85 || c === 86;
  const isRainCode = (c: number) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;

  let rainyDays: number;
  let snowyDays: number;
  if (source === "forecast") {
    const chances = nums(daily.precipitation_probability_max);
    rainyDays = codes.filter((c, i) => isRainCode(c) || (chances[i] ?? 0) >= 50).length;
    snowyDays = codes.filter(isSnowCode).length;
  } else {
    rainyDays = nums(daily.precipitation_sum).filter((mm) => mm >= 1).length;
    snowyDays = Math.max(nums(daily.snowfall_sum).filter((cm) => cm > 0).length, codes.filter(isSnowCode).length);
  }
  return { source, days: highs.length, high: Math.round(Math.max(...highs)), low: Math.round(Math.min(...lows)), rainyDays, snowyDays };
}

/** One line for the prompt. */
export function describeTripWeather(w: TripWeather | null) {
  if (!w) return "Weather: unknown. Pack for the usual climate at the destination in that season.";
  const what = w.source === "forecast" ? `Forecast for ${w.days} day(s)` : `Same dates last year (typical weather, ${w.days} day(s))`;
  return `${what}: highs up to ${w.high}°C, lows down to ${w.low}°C, rain on ${w.rainyDays} day(s), snow on ${w.snowyDays} day(s).`;
}

/** First coordinates found in a list of activities. */
export function firstCoords(rows: { latitude?: number; longitude?: number }[]) {
  const hit = rows.find((r) => r.latitude != null && r.longitude != null);
  return hit ? { latitude: hit.latitude!, longitude: hit.longitude! } : null;
}

export type PackingContext = {
  tripTitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  days: { dayNumber: number; date?: string; location?: string; activities: { title: string; category?: string; subcategory?: string }[] }[];
  existing: string[];
};

/** The user message: the trip, the weather and what's already packed. */
export function packingContent(ctx: PackingContext, weather: TripWeather | null) {
  const days = ctx.days
    .map((d) => {
      const acts = d.activities.map((a) => `${a.title}${a.category ? ` [${[a.category, a.subcategory].filter(Boolean).join("/")}]` : ""}`).join("; ");
      return `Day ${d.dayNumber}${d.date ? ` (${d.date})` : ""}${d.location ? ` in ${d.location}` : ""}: ${acts || "free day"}`;
    })
    .join("\n");
  return [
    `Trip: ${ctx.tripTitle} to ${ctx.destination}, ${ctx.startDate} to ${ctx.endDate}.`,
    `Travelers: ${ctx.travelers}.`,
    describeTripWeather(weather),
    "",
    "Plan:",
    days || "No activities planned yet.",
    "",
    `Already on the list: ${ctx.existing.length ? ctx.existing.join("; ") : "nothing yet"}.`,
  ].join("\n");
}
