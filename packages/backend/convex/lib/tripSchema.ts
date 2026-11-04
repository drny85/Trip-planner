import { z } from "zod";
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
const CATEGORIES = ["sightseeing", "food", "lodging", "transport", "shopping", "nightlife", "nature", "other"] as const;
type Category = (typeof CATEGORIES)[number];
const toCategory = (value: string): Category => {
  const normalized = value.trim().toLowerCase();
  return (CATEGORIES as readonly string[]).includes(normalized) ? (normalized as Category) : "other";
};

const isoDate = z.string().describe("ISO date, YYYY-MM-DD");

export const generatedActivitySchema = z.object({
  title: z.string().describe('Short action title, e.g. "Visit Senso-ji Temple"'),
  description: z.string().describe("One or two sentences on what to do and why it's worth it"),
  address: z.string().describe("Full street address a maps app can find"),
  phone: z.string().optional().describe("International format, only if you are confident it is correct"),
  bookingUrl: z.string().optional().describe("Official reservation or ticket page, if one exists"),
  websiteUrl: z.string().optional().describe("Official website"),
  category: z
    .string()
    .describe(`One of: ${CATEGORIES.join(", ")}`),
  startTime: z.string().describe("Local start time, HH:mm 24h"),
  durationMinutes: z.number().describe("Whole minutes"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  estimatedCost: z.number().optional().describe("Approximate cost per person in the trip currency"),
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

/** Converts the model's output into the tree `insertTripTree` stores. */
export function toTripTree(trip: GeneratedTrip): TripTreeInput {
  return {
    ...trip,
    imageUrl: photoFor("hero", trip.destination, 1600),
    subTrips: trip.subTrips.map((subTrip) => ({
      ...subTrip,
      dayNumber: Math.max(1, Math.round(subTrip.dayNumber)),
      activities: subTrip.activities.map((activity) => {
        const category = toCategory(activity.category);
        return {
          ...activity,
          category,
          durationMinutes: Math.max(0, Math.round(activity.durationMinutes)),
          bookingUrl: safeUrl(activity.bookingUrl),
          websiteUrl: safeUrl(activity.websiteUrl),
          photoUrl: photoFor(category, `${trip.destination}-${activity.title}`, 1000),
        };
      }),
    })),
  };
}
