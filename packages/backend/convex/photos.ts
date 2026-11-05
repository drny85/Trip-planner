import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { decodeEntities } from "./lib/text";
import { findGooglePlace, placePhotoUrl, placesApiKey } from "./lib/googlePlaces";
import { findPlacePhoto } from "./lib/wikiPhotos";

/**
 * Swaps a trip's stock photos for real photos of each place: Wikipedia first
 * (landmarks), then Google Places for what Wikipedia can't match (restaurants,
 * bars, hotels, shops) when GOOGLE_PLACES_API_KEY is set. Runs in the background
 * after a trip is created; anything it can't match keeps its stock photo, so this
 * only ever improves the trip.
 */
export const enrichTrip = internalAction({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const places = await ctx.runQuery(internal.photos.placesForTrip, { tripId });
    if (!places) return;

    const hero = await findPlacePhoto(places.destination, "", 1600);
    const activities: Array<{
      activityId: (typeof places.activities)[number]["activityId"];
      photoUrl: string;
      photoCredit?: string;
    }> = [];
    const siteUrl = process.env.CONVEX_SITE_URL;
    const useGoogle = Boolean(placesApiKey() && siteUrl);

    // A few at a time, to be polite to both APIs.
    for (let i = 0; i < places.activities.length; i += 4) {
      const batch = places.activities.slice(i, i + 4);
      const found = await Promise.all(
        batch.map(async (a) => {
          // Hotels rarely have a Wikipedia page of their own, and a loose match
          // there is more likely wrong than right, so they go straight to Google.
          if (a.category !== "lodging") {
            const wiki = await findPlacePhoto(a.title, a.context);
            if (wiki) return { photoUrl: wiki };
          }
          if (!useGoogle) return null;
          const place = await findGooglePlace(a.title, a.address, a.context);
          return place ? { photoUrl: placePhotoUrl(siteUrl!, place.placeId), photoCredit: place.credit } : null;
        }),
      );
      batch.forEach((a, j) => {
        if (found[j]) activities.push({ activityId: a.activityId, ...found[j]! });
      });
    }

    await ctx.runMutation(internal.photos.applyPhotos, { tripId, heroUrl: hero ?? undefined, activities });
  },
});

export const placesForTrip = internalQuery({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await ctx.db.get("trips", tripId);
    if (!trip) return null;
    const subTrips = await ctx.db
      .query("subTrips")
      .withIndex("by_tripId_order", (q) => q.eq("tripId", tripId))
      .collect();
    const cityOf = new Map(subTrips.map((s) => [s._id, s.location ?? trip.destination]));
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_tripId", (q) => q.eq("tripId", tripId))
      .collect();
    return {
      destination: trip.destination,
      activities: activities
        // Train rides and flights have no photo of their own worth finding.
        .filter((a) => a.category !== "transport")
        .map((a) => ({
          activityId: a._id,
          title: a.title,
          address: a.address,
          category: a.category,
          context: cityOf.get(a.subTripId) ?? trip.destination,
        })),
    };
  },
});

/**
 * One-off repair for trips planned before titles were cleaned up: turns HTML
 * entities ("&amp;") in a trip's titles and descriptions back into characters.
 * Run with `npx convex run photos:decodeTripText '{"tripId":"..."}'`.
 */
export const decodeTripText = internalMutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await ctx.db.get("trips", tripId);
    if (!trip) return 0;
    let fixed = 0;
    const clean = <T extends Record<string, unknown>>(doc: T, keys: (keyof T & string)[]) => {
      const patch: Record<string, string> = {};
      for (const k of keys) {
        const value = doc[k];
        if (typeof value === "string" && decodeEntities(value) !== value) patch[k] = decodeEntities(value);
      }
      fixed += Object.keys(patch).length;
      return Object.keys(patch).length ? patch : null;
    };
    const tripPatch = clean(trip, ["title", "description"]);
    if (tripPatch) await ctx.db.patch("trips", tripId, tripPatch);
    for (const day of await ctx.db.query("subTrips").withIndex("by_tripId_order", (q) => q.eq("tripId", tripId)).collect()) {
      const patch = clean(day, ["title"]);
      if (patch) await ctx.db.patch("subTrips", day._id, patch);
    }
    for (const a of await ctx.db.query("activities").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect()) {
      const patch = clean(a, ["title", "description", "address"]);
      if (patch) await ctx.db.patch("activities", a._id, patch);
    }
    return fixed;
  },
});

export const applyPhotos = internalMutation({
  args: {
    tripId: v.id("trips"),
    heroUrl: v.optional(v.string()),
    activities: v.array(
      v.object({ activityId: v.id("activities"), photoUrl: v.string(), photoCredit: v.optional(v.string()) }),
    ),
  },
  handler: async (ctx, { tripId, heroUrl, activities }) => {
    if (!(await ctx.db.get("trips", tripId))) return; // deleted meanwhile
    if (heroUrl) await ctx.db.patch("trips", tripId, { imageUrl: heroUrl });
    for (const { activityId, photoUrl, photoCredit } of activities) {
      if (await ctx.db.get("activities", activityId)) await ctx.db.patch("activities", activityId, { photoUrl, photoCredit });
    }
  },
});
