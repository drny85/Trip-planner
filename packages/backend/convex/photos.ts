import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { decodeEntities } from "./lib/text";
import { findGooglePlace, googlePlacesKey, placePhotoUrl } from "./lib/googlePlaces";
import { findPlacePhoto } from "./lib/wikiPhotos";

/**
 * Swaps a trip's stock photos for real photos of each place. Wikipedia goes
 * first (free, good for landmarks); then, if GOOGLE_PLACES_API_KEY is set,
 * Google Places fills in restaurants, cafés, hotels and the rest. Runs in the
 * background after a trip is created; anything neither source matches keeps
 * its stock photo, so this only ever improves the trip.
 */
export const enrichTrip = internalAction({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const places = await ctx.runQuery(internal.photos.placesForTrip, { tripId });
    if (!places) return;

    const hero = await findPlacePhoto(places.destination, "", 1600);
    type Found = {
      activityId: (typeof places.activities)[number]["activityId"];
      /** Unset when only the Google place was found and Wikipedia's photo is kept. */
      photoUrl?: string;
      credit?: string;
      placeId?: string;
      lookedUp?: boolean;
    };
    const found = new Map<string, Found>();

    // Train rides and hotel check-ins rarely have a Wikipedia page of their own,
    // and a loose match there is more likely wrong than right.
    const forWiki = places.activities.filter((a) => a.category !== "lodging");
    // A few at a time, to be polite to the Wikipedia API.
    for (let i = 0; i < forWiki.length; i += 4) {
      const batch = forWiki.slice(i, i + 4);
      const urls = await Promise.all(batch.map((a) => findPlacePhoto(a.title, a.context)));
      batch.forEach((a, j) => {
        if (urls[j]) found.set(a.activityId, { activityId: a.activityId, photoUrl: urls[j]! });
      });
    }

    // Every place is looked up on Google too: its place ID gives the live rating,
    // hours and phone (places.details). Its photo is used only where Wikipedia had none.
    const key = googlePlacesKey();
    if (key) {
      const all = places.activities.filter((a) => !a.placeId);
      for (let i = 0; i < all.length; i += 4) {
        const batch = all.slice(i, i + 4);
        const matches = await Promise.all(batch.map((a) => findGooglePlace(a.title, [a.address, a.context].filter(Boolean).join(", "), key)));
        batch.forEach((a, j) => {
          const m = matches[j];
          const wiki = found.get(a.activityId);
          const url = m && !wiki ? placePhotoUrl(m.placeId) : null;
          found.set(a.activityId, {
            activityId: a.activityId,
            photoUrl: wiki?.photoUrl ?? url ?? undefined,
            credit: url ? m?.credit : undefined,
            placeId: m?.placeId,
            lookedUp: true,
          });
        });
      }
    }

    await ctx.runMutation(internal.photos.applyPhotos, { tripId, heroUrl: hero ?? undefined, activities: [...found.values()] });
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
        // A train ride is not a place with a photo of its own.
        .filter((a) => a.category !== "transport")
        .map((a) => ({
          activityId: a._id,
          title: a.title,
          placeId: a.placeId,
          category: a.category,
          address: a.address,
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
      v.object({
        activityId: v.id("activities"),
        photoUrl: v.optional(v.string()),
        credit: v.optional(v.string()),
        placeId: v.optional(v.string()),
        lookedUp: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { tripId, heroUrl, activities }) => {
    if (!(await ctx.db.get("trips", tripId))) return; // deleted meanwhile
    if (heroUrl) await ctx.db.patch("trips", tripId, { imageUrl: heroUrl });
    for (const { activityId, photoUrl, credit, placeId, lookedUp } of activities) {
      if (!(await ctx.db.get("activities", activityId))) continue;
      if (photoUrl) await ctx.db.patch("activities", activityId, { photoUrl, photoCredit: credit });
      if (lookedUp) await ctx.db.patch("activities", activityId, { placeId, placeLookedUp: true });
      // Only places whose Google photo we use may be served by /place-photo.
      if (placeId && photoUrl?.includes("/place-photo/") && !(await ctx.db.query("placePhotos").withIndex("by_placeId", (q) => q.eq("placeId", placeId)).unique())) {
        await ctx.db.insert("placePhotos", { placeId });
      }
    }
  },
});

/** Whether /place-photo may serve this place (we matched it for a trip). */
export const isKnownPlace = internalQuery({
  args: { placeId: v.string() },
  handler: async (ctx, { placeId }) =>
    Boolean(await ctx.db.query("placePhotos").withIndex("by_placeId", (q) => q.eq("placeId", placeId)).unique()),
});
