import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { getMemberActivity } from "./lib/auth";
import { findGooglePlace, googlePlacesKey, placeDetails, type PlaceDetails } from "./lib/googlePlaces";
import { languageOf } from "./lib/notify";

/**
 * Live Google details for an activity's place: rating, price, phone, website,
 * hours, open now. Shown when an activity is opened, never stored, since
 * Google's terms only let us keep the place ID. An activity that has no place
 * yet (added by hand, say) is looked up once and its place ID saved.
 */
export const details = action({
  args: { activityId: v.id("activities") },
  handler: async (ctx, { activityId }): Promise<PlaceDetails | null> => {
    const key = googlePlacesKey();
    if (!key) return null;
    const place = await ctx.runQuery(internal.places.placeFor, { activityId });
    if (!place) return null;
    let placeId = place.placeId;
    if (!placeId) {
      if (place.lookedUp) return null;
      const found = await findGooglePlace(place.title, [place.address, place.city].filter(Boolean).join(", "), key);
      await ctx.runMutation(internal.places.savePlace, { activityId, placeId: found?.placeId });
      placeId = found?.placeId;
      if (!placeId) return null;
    }
    return placeDetails(placeId, key, place.language);
  },
});

export const placeFor = internalQuery({
  args: { activityId: v.id("activities") },
  handler: async (ctx, { activityId }) => {
    // Throws unless the caller is on the trip.
    const { activity, trip, userId } = await getMemberActivity(ctx, activityId);
    if (activity.category === "transport") return null;
    const day = await ctx.db.get("subTrips", activity.subTripId);
    return {
      placeId: activity.placeId,
      lookedUp: activity.placeLookedUp ?? false,
      title: activity.title,
      address: activity.address,
      city: day?.location ?? trip.destination,
      language: await languageOf(ctx, userId),
    };
  },
});

export const savePlace = internalMutation({
  args: { activityId: v.id("activities"), placeId: v.optional(v.string()) },
  handler: async (ctx, { activityId, placeId }) => {
    if (await ctx.db.get("activities", activityId)) {
      await ctx.db.patch("activities", activityId, { placeId, placeLookedUp: true });
    }
  },
});
