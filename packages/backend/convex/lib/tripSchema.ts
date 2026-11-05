import { z } from "zod";
import { CATEGORIES, CATEGORY_TREE, isCategory, toSubcategory, type Category } from "./categories";
import { photoFor } from "./photos";
import type { TripTreeInput } from "./validators";

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

export const generatedActivitySchema = z.object({
  ...generatedActivityFields,
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


/** Only keep links that are real http(s) URLs. */
const safeUrl = (url?: string) => (url && /^https?:\/\//i.test(url) ? url : undefined);

function toActivity(activity: z.infer<z.ZodObject<typeof generatedActivityFields>>, destination: string) {
  const category = toCategory(activity.category);
  return {
    ...activity,
    category,
    subcategory: toSubcategory(category, activity.subcategory),
    durationMinutes: Math.max(0, Math.round(activity.durationMinutes)),
    bookingUrl: safeUrl(activity.bookingUrl),
    websiteUrl: safeUrl(activity.websiteUrl),
    photoUrl: photoFor(category, `${destination}-${activity.title}`, 1000),
  };
}

/** Converts the model's output into the tree `insertTripTree` stores. */
export function toTripTree(trip: GeneratedTrip): TripTreeInput {
  return {
    ...trip,
    imageUrl: photoFor("hero", trip.destination, 1600),
    subTrips: trip.subTrips.map((subTrip) => ({
      ...subTrip,
      dayNumber: Math.max(1, Math.round(subTrip.dayNumber)),
      activities: subTrip.activities.map(({ subActivities, ...activity }) => ({
        ...toActivity(activity, trip.destination),
        subActivities: subActivities?.length ? subActivities.map((sub) => toActivity(sub, trip.destination)) : undefined,
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
      }),
    )
    .describe("The whole day in time order, kept and new activities together"),
});
export type Replan = z.infer<typeof replanSchema>;

/** A new activity from a re-plan, normalized like a generated one. */
export const toNewActivity = (activity: z.infer<z.ZodObject<typeof generatedActivityFields>>, destination: string) => toActivity(activity, destination);
