/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { localClock, parseDetails } from "./lib/googlePlaces";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

test("localClock turns Google's UTC times into the place's local time", () => {
  expect(localClock("2026-11-05T22:00:00Z", -300)).toBe("17:00");
  expect(localClock("2026-11-05T23:30:00Z", 540)).toBe("08:30");
  expect(localClock(undefined, 0)).toBeUndefined();
});

test("parseDetails keeps what the apps show", () => {
  expect(
    parseDetails({
      displayName: { text: "Daikokuya" },
      rating: 4.4,
      userRatingCount: 3120,
      priceLevel: "PRICE_LEVEL_MODERATE",
      internationalPhoneNumber: "+81 3-3844-1111",
      websiteUri: "https://tempura.co.jp",
      googleMapsUri: "https://maps.google.com/?cid=1",
      businessStatus: "OPERATIONAL",
      utcOffsetMinutes: 540,
      currentOpeningHours: { openNow: true, nextCloseTime: "2026-11-05T11:30:00Z", weekdayDescriptions: ["Monday: 11:00 AM – 8:30 PM"] },
    }),
  ).toEqual({
    name: "Daikokuya",
    rating: 4.4,
    ratingCount: 3120,
    priceLevel: 2,
    phone: "+81 3-3844-1111",
    website: "https://tempura.co.jp",
    mapsUrl: "https://maps.google.com/?cid=1",
    status: "open",
    openNow: true,
    nextChange: "20:30",
    weekHours: ["Monday: 11:00 AM – 8:30 PM"],
    summary: undefined,
  });
});

test("details looks a place up once, saves only its ID, and fetches the rest live", async () => {
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
  vi.stubEnv("CONVEX_SITE_URL", "https://demo.convex.site");
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("wikipedia.org")) return json({ query: { pages: [] } });
      if (url.endsWith("/places:searchText")) {
        const { textQuery } = JSON.parse(String(init?.body)) as { textQuery: string };
        return json({
          places: textQuery.startsWith("Tempura lunch at Daikokuya")
            ? [{ id: "ChIJdaikokuya", displayName: { text: "Daikokuya" }, photos: [{ name: "places/ChIJdaikokuya/photos/a" }] }]
            : [],
        });
      }
      if (url.includes("/places/ChIJdaikokuya?languageCode=")) {
        expect(url).toContain("languageCode=en");
        return json({ displayName: { text: "Daikokuya" }, rating: 4.4, userRatingCount: 3120 });
      }
      return new Response("unexpected", { status: 500 });
    }),
  );

  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const tripId = await t.mutation(api.seed.demoTrip, {});
  // Before the background lookup runs, the activity has no place ID yet.
  const trip = await t.query(api.trips.get, { tripId });
  const tempura = trip!.subTrips.flatMap((s) => s.activities).find((a) => a.title === "Tempura lunch at Daikokuya")!;
  const shinkansen = trip!.subTrips.flatMap((s) => s.activities).find((a) => a.category === "transport")!;

  const first = await t.action(api.places.details, { activityId: tempura._id });
  expect(first).toMatchObject({ name: "Daikokuya", rating: 4.4, ratingCount: 3120 });
  const searches = () => calls.filter((c) => c.endsWith("/places:searchText")).length;
  expect(searches()).toBe(1);

  // Second open: no new search, just the live details.
  await t.action(api.places.details, { activityId: tempura._id });
  expect(searches()).toBe(1);

  // Train rides have no place page.
  expect(await t.action(api.places.details, { activityId: shinkansen._id })).toBeNull();

  // Renaming it means it may be somewhere else: the next open searches again.
  await t.mutation(api.activities.update, { activityId: tempura._id, patch: { title: "Tempura lunch at Daikokuya (Asakusa)" } });
  await t.action(api.places.details, { activityId: tempura._id });
  expect(searches()).toBe(2);
});

test("details is off without an API key", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const tripId = await t.mutation(api.seed.demoTrip, {});
  const activity = (await t.query(api.trips.get, { tripId }))!.subTrips[0]!.activities[0]!;
  expect(await t.action(api.places.details, { activityId: activity._id })).toBeNull();
});
