import { z } from "zod";
import { CATEGORIES, CATEGORY_TREE, isCategory, toSubcategory, type Category } from "./categories";
import { photoFor, photoPicker } from "./photos";
import { decodeEntities } from "./text";
import { CROWD_LEVELS, TIP_KINDS, type CrowdLevel, type TipKind, type TripTreeInput } from "./validators";

/**
 * The exact JSON shape Claude must return for a generated trip. It is sent to the
 * API as a structured-output schema and the response is parsed against it, so a
 * reply that doesn't match never reaches the database.
 *
 * Photo URLs are not asked for: a model can't know real image URLs, so
 * `toTripTree` picks free Unsplash photos by category (photos.ts).
 * Swap in a places/photos API later for photos of the actual place.
 */
// Structured outputs can't enforce enums/patterns here, so the schema stays loose
// and `toTripTree` normalizes the values instead of rejecting the whole trip.
const toCategory = (value: string): Category => {
  const normalized = value.trim().toLowerCase();
  return isCategory(normalized) ? normalized : "other";
};
const taxonomy = CATEGORIES.filter((c) => CATEGORY_TREE[c].length)
  .map((c) => `${c} (${CATEGORY_TREE[c].join(", ")})`)
  .join("; ");

const isoDate = z.string().describe("ISO date, YYYY-MM-DD");

const generatedActivityFields = {
  title: z.string().describe('Short action title, e.g. "Visit Senso-ji Temple"'),
  description: z.string().describe("One or two sentences on what to do and why it's worth it"),
  address: z.string().describe("Full street address a maps app can find"),
  phone: z.string().optional().describe("International format, only if you are confident it is correct"),
  bookingUrl: z.string().optional().describe("Official reservation or ticket page, if one exists"),
  websiteUrl: z.string().optional().describe("Official website"),
  category: z.string().describe(`One of: ${CATEGORIES.join(", ")}`),
  subcategory: z.string().optional().describe(`Optional finer type under the category: ${taxonomy}`),
  startTime: z.string().describe("Local start time, HH:mm 24h"),
  durationMinutes: z.number().describe("Whole minutes"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  estimatedCost: z.number().optional().describe("Approximate cost per person in the trip currency"),
};

/**
 * Local knowledge on a top-level activity: tips, a crowd forecast and whether
 * it's a hidden gem. Sub-activities don't get these, to keep replies short.
 */
export const insightFields = {
  localTips: z
    .array(
      z.object({
        kind: z
          .string()
          .describe(
            "One of: time (best time to go, how to beat the crowds), order (what to order or try), free (free days, discounts, passes), insider (a trick locals know), avoid (a nearby tourist trap or what to skip)",
          ),
        text: z.string().describe("One short, specific sentence, under 20 words"),
      }),
    )
    .optional()
    .describe("1 to 3 practical tips a local would give about this exact place"),
  crowd: z
    .object({
      level: z.string().describe("quiet, moderate, busy or packed: how crowded it usually is at the planned start time on that weekday"),
      peakFrom: z.string().optional().describe("Start of the busiest stretch that day, HH:mm 24h"),
      peakTo: z.string().optional().describe("End of the busiest stretch that day, HH:mm 24h"),
      bestTime: z.string().optional().describe("The calmest good time to arrive that day, HH:mm 24h"),
    })
    .optional()
    .describe("Crowd forecast. Leave it out for transport and stays"),
  isLocalPick: z.boolean().optional().describe("true only for a place mostly locals know and love, not a major tourist sight"),
};

export const generatedActivitySchema = z.object({
  ...generatedActivityFields,
  ...insightFields,
  subActivities: z
    .array(z.object(generatedActivityFields))
    .optional()
    .describe("Optional steps inside this activity, e.g. the stalls to try in a market or check-in steps for a stay"),
});

export const generatedTripSchema = z.object({
  title: z.string().describe('Catchy trip name, e.g. "Tokyo Adventure"'),
  destination: z.string(),
  description: z.string().describe("One-sentence summary of the trip"),
  startDate: isoDate,
  endDate: isoDate,
  currency: z.string().describe("ISO 4217 code of the local currency, e.g. JPY"),
  subTrips: z
    .array(
      z.object({
        title: z.string().describe('e.g. "Day 1 · Asakusa & Ueno" or "Kyoto Leg"'),
        dayNumber: z.number().describe("1-based day the leg starts on"),
        date: isoDate,
        location: z.string().describe("City or area"),
        activities: z.array(generatedActivitySchema).describe("3 to 5 activities in time order"),
      }),
    )
    .describe("One entry per day, or per multi-day leg"),
});

export type GeneratedTrip = z.infer<typeof generatedTripSchema>;


type RawInsights = Partial<z.infer<z.ZodObject<typeof insightFields>>>;
const isTipKind = (k: string): k is TipKind => (TIP_KINDS as readonly string[]).includes(k);
const isCrowdLevel = (k: string): k is CrowdLevel => (CROWD_LEVELS as readonly string[]).includes(k);

/** "9:05" -> "09:05"; anything that isn't a time of day -> undefined. */
export function toHHMM(value?: string) {
  const m = value ? /^(\d{1,2}):(\d{2})$/.exec(value.trim()) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return undefined;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

/** Keeps up to three well-formed tips, one per kind where possible. */
export function toTips(tips: RawInsights["localTips"]) {
  const out: { kind: TipKind; text: string }[] = [];
  for (const tip of tips ?? []) {
    const kind = tip.kind.trim().toLowerCase();
    const text = decodeEntities(tip.text).trim().slice(0, 240);
    if (!isTipKind(kind) || !text || out.some((t) => t.text === text)) continue;
    out.push({ kind, text });
  }
  return out.length ? out.slice(0, 3) : undefined;
}

export function toCrowd(crowd: RawInsights["crowd"]) {
  const level = crowd?.level.trim().toLowerCase();
  if (!level || !isCrowdLevel(level)) return undefined;
  const peakFrom = toHHMM(crowd!.peakFrom);
  const peakTo = toHHMM(crowd!.peakTo);
  // A peak needs both ends, in order.
  const peak = peakFrom && peakTo && peakFrom < peakTo ? { peakFrom, peakTo } : {};
  return { level, ...peak, bestTime: toHHMM(crowd!.bestTime) };
}

/** The normalized local tips, crowd forecast and hidden-gem flag. */
export const toInsights = (raw: RawInsights) => ({
  localTips: toTips(raw.localTips),
  crowd: toCrowd(raw.crowd),
  isLocalPick: raw.isLocalPick ? true : undefined,
});

/** Only keep links that are real http(s) URLs. */
const safeUrl = (url?: string) => (url && /^https?:\/\//i.test(url) ? url : undefined);

function toActivity(activity: z.infer<z.ZodObject<typeof generatedActivityFields>> & RawInsights, destination: string, pick: typeof photoFor = photoFor) {
  const category = toCategory(activity.category);
  const subcategory = toSubcategory(category, activity.subcategory);
  return {
    ...activity,
    ...toInsights(activity),
    title: decodeEntities(activity.title),
    description: decodeEntities(activity.description),
    address: decodeEntities(activity.address),
    category,
    subcategory,
    durationMinutes: Math.max(0, Math.round(activity.durationMinutes)),
    bookingUrl: safeUrl(activity.bookingUrl),
    websiteUrl: safeUrl(activity.websiteUrl),
    photoUrl: pick(category, `${destination}-${activity.title}`, 1000, subcategory),
  };
}

/** Converts the model's output into the tree `insertTripTree` stores. */
export function toTripTree(trip: GeneratedTrip): TripTreeInput {
  const pick = photoPicker();
  return {
    ...trip,
    title: decodeEntities(trip.title),
    description: decodeEntities(trip.description),
    imageUrl: photoFor("hero", trip.destination, 1600),
    subTrips: trip.subTrips.map((subTrip) => ({
      ...subTrip,
      title: decodeEntities(subTrip.title),
      dayNumber: Math.max(1, Math.round(subTrip.dayNumber)),
      activities: subTrip.activities.map(({ subActivities, ...activity }) => ({
        ...toActivity(activity, trip.destination, pick),
        subActivities: subActivities?.length ? subActivities.map((sub) => toActivity(sub, trip.destination, pick)) : undefined,
      })),
    })),
  };
}

/**
 * A revised plan for one day. Each stop either keeps an existing activity
 * (`keepId`, possibly at a new time) or is a new one the model suggests.
 */
export const replanSchema = z.object({
  summary: z.string().describe("One or two sentences, addressed to the traveler, on what changed and why"),
  activities: z
    .array(
      z.object({
        keepId: z.string().optional().describe("The id of an existing activity to keep. Leave it out for a new activity"),
        ...generatedActivityFields,
        ...insightFields,
      }),
    )
    .describe("The whole day in time order, kept and new activities together"),
});
export type Replan = z.infer<typeof replanSchema>;

/** A new activity from a re-plan, normalized like a generated one. */
export const toNewActivity = (activity: z.infer<z.ZodObject<typeof generatedActivityFields>> & RawInsights, destination: string) => toActivity(activity, destination);

/**
 * "Local's pick" for one day: tourist-heavy stops swapped for places locals
 * love. Kept stops (`keepId`) come back with their tips and crowd forecast too.
 */
export const localPickSchema = z.object({
  summary: z.string().describe("One or two sentences, addressed to the traveler, on what you swapped and why locals prefer it"),
  activities: z
    .array(
      z.object({
        keepId: z.string().optional().describe("The id of an existing activity to keep. Leave it out for a new activity"),
        replaces: z.string().optional().describe("For a new stop: the title of the stop it swaps out"),
        ...generatedActivityFields,
        ...insightFields,
      }),
    )
    .describe("The whole day in time order, kept and new activities together"),
});

/** Just the tips and crowd forecast for activities already planned. */
export const tipsSchema = z.object({
  activities: z.array(z.object({ id: z.string().describe("The activity's id, as given"), ...insightFields })),
});
