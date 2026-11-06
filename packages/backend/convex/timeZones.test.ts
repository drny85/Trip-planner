/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { isTimeZone, timeZoneFromForecast, timeZoneFromGeocode } from "./lib/timeZone";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => vi.unstubAllGlobals());

describe("trip time zones", () => {
  test("reads zones from Open-Meteo and rejects junk", () => {
    expect(isTimeZone("Asia/Tokyo")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone(42)).toBe(false);
    expect(timeZoneFromForecast({ timezone: "America/Santo_Domingo" })).toBe("America/Santo_Domingo");
    expect(timeZoneFromForecast({ timezone: "GMT" })).toBeNull();
    expect(timeZoneFromGeocode({ results: [{ timezone: "Europe/Paris" }] })).toBe("Europe/Paris");
    expect(timeZoneFromGeocode(null)).toBeNull();
  });

  test("detect saves the zone of the first located stop, once", async () => {
    const t = convexTest(schema, modules);
    const tripId = await t.mutation(api.seed.demoTrip, {});
    // Other background jobs (photos) also fetch; answer only the forecast lookup.
    const lookups: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (!url.includes("open-meteo")) return new Response("", { status: 404 });
      lookups.push(url);
      return new Response(JSON.stringify({ timezone: "Asia/Tokyo" }));
    }));

    await t.action(internal.timeZones.detect, { tripId });
    expect((await t.query(api.trips.get, { tripId }))?.timeZone).toBe("Asia/Tokyo");

    expect(lookups.some((u) => u.includes("/v1/forecast") && u.includes("timezone=auto"))).toBe(true);

    // Already set: no more lookups.
    const before = lookups.length;
    await t.action(internal.timeZones.detect, { tripId });
    expect(lookups).toHaveLength(before);
  });

  test("falls back to the destination name, and leaves it unset when nothing answers", async () => {
    const t = convexTest(schema, modules);
    const tripId = await t.mutation(api.seed.demoTrip, {});
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("geocoding-api.open-meteo") ? new Response(JSON.stringify({ results: [{ timezone: "Asia/Tokyo" }] })) : new Response("{}", { status: 500 }),
    ));
    await t.action(internal.timeZones.detect, { tripId });
    expect((await t.query(api.trips.get, { tripId }))?.timeZone).toBe("Asia/Tokyo");

    const other = await t.mutation(api.seed.demoTrip, {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await t.action(internal.timeZones.detect, { tripId: other });
    expect((await t.query(api.trips.get, { tripId: other }))?.timeZone).toBeUndefined();
  });

  test("only members can ask for the lookup", async () => {
    const t = convexTest(schema, modules);
    const tripId = await t.mutation(api.seed.demoTrip, {});
    await t.mutation(api.timeZones.ensure, { tripId });
    await expect(t.withIdentity({ subject: "stranger" }).mutation(api.timeZones.ensure, { tripId })).rejects.toThrow();
  });
});
