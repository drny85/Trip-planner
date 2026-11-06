import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { getMemberTrip } from "./lib/auth";
import { isTimeZone, timeZoneFromForecast, timeZoneFromGeocode } from "./lib/timeZone";

/**
 * Every trip gets the IANA time zone of its destination ("America/Santo_Domingo"),
 * so calendar events land at the trip's local clock time whatever zone the
 * phone is in. It's looked up once, from Open-Meteo: the first located stop's
 * coordinates, else the destination's name.
 */

/** Asks for the lookup when an older trip has no zone yet. Any member may ask; it's a no-op once set. */
export const ensure = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const { trip } = await getMemberTrip(ctx, tripId);
    if (!trip.timeZone) await ctx.scheduler.runAfter(0, internal.timeZones.detect, { tripId });
  },
});

export const lookupInput = internalQuery({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await ctx.db.get("trips", tripId);
    if (!trip || trip.timeZone) return null;
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_tripId", (q) => q.eq("tripId", tripId))
      .collect();
    const located = activities.find((a) => a.latitude != null && a.longitude != null);
    return {
      destination: trip.destination,
      coords: located ? { latitude: located.latitude!, longitude: located.longitude! } : null,
    };
  },
});

export const save = internalMutation({
  args: { tripId: v.id("trips"), timeZone: v.string() },
  handler: async (ctx, { tripId, timeZone }) => {
    const trip = await ctx.db.get("trips", tripId);
    if (trip && !trip.timeZone && isTimeZone(timeZone)) await ctx.db.patch("trips", tripId, { timeZone });
  },
});

export const detect = internalAction({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const input = await ctx.runQuery(internal.timeZones.lookupInput, { tripId });
    if (!input) return;
    let zone: string | null = null;
    if (input.coords) {
      const params = new URLSearchParams({ latitude: String(input.coords.latitude), longitude: String(input.coords.longitude), timezone: "auto", forecast_days: "1" });
      zone = timeZoneFromForecast(await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`));
    }
    if (!zone) {
      const name = input.destination.split(",")[0]!.trim();
      if (name) {
        const params = new URLSearchParams({ name, count: "1", format: "json" });
        zone = timeZoneFromGeocode(await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`));
      }
    }
    // No answer leaves the trip without a zone; calendars then use the phone's, as before.
    if (zone) await ctx.runMutation(internal.timeZones.save, { tripId, timeZone: zone });
  },
});

async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
