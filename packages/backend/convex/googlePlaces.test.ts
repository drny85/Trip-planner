/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { findGooglePlace, placeName, placePhotoUrl } from "./lib/googlePlaces";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SITE = "https://example.convex.site";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("placeName drops lead-in words", () => {
  expect(placeName("Dinner at A Cevicheria")).toBe("A Cevicheria");
  expect(placeName("Lunch at Time Out Market")).toBe("Time Out Market");
  expect(placeName("LX Factory")).toBe("LX Factory");
});

test("placePhotoUrl points at our route and clamps the width", () => {
  expect(placePhotoUrl(`${SITE}/`, "ChIJN1t_tDeuEmsRUsoyG83frY4", 5000)).toBe(
    `${SITE}/place-photo?place=ChIJN1t_tDeuEmsRUsoyG83frY4&w=1600`,
  );
});

test("findGooglePlace is off without an API key", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(await findGooglePlace("Dinner at A Cevicheria", "", "Lisbon")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test("findGooglePlace only accepts a place whose name matches", async () => {
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return json({
        places: [
          { id: "ChIJotherplace0001", displayName: { text: "Some Other Bar" }, photos: [{ name: "p/1" }] },
          {
            id: "ChIJcevicheria0001",
            displayName: { text: "A Cevicheria" },
            photos: [{ name: "p/2", authorAttributions: [{ displayName: "Ana Silva" }] }],
          },
        ],
      });
    }),
  );
  expect(await findGooglePlace("Dinner at A Cevicheria", "Rua Dom Pedro V 129", "Lisbon")).toEqual({
    placeId: "ChIJcevicheria0001",
    credit: "Ana Silva",
  });
  expect(JSON.parse(bodies[0]!).textQuery).toBe("A Cevicheria, Rua Dom Pedro V 129");

  vi.stubGlobal("fetch", vi.fn(async () => json({ places: [{ id: "ChIJotherplace0001", displayName: { text: "Some Other Bar" }, photos: [{ name: "p/1" }] }] })));
  expect(await findGooglePlace("Dinner at A Cevicheria", "", "Lisbon")).toBeNull();
});

test("enrichTrip falls back to Google Places when Wikipedia has no match", async () => {
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
  vi.stubEnv("CONVEX_SITE_URL", SITE);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("wikipedia.org")) return json({ query: { pages: [] } });
      // Google: echo back a place named after the query, so every place matches.
      const name = (JSON.parse(String(init?.body)).textQuery as string).split(",")[0]!;
      const id = `ChIJ${name.replace(/[^A-Za-z0-9]/g, "").padEnd(10, "x").slice(0, 40)}`;
      return json({ places: [{ id, displayName: { text: name }, photos: [{ name: "p/1", authorAttributions: [{ displayName: "Kenji" }] }] }] });
    }),
  );

  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const tripId = await t.mutation(api.seed.demoTrip, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const after = await t.query(api.trips.get, { tripId });
  const activities = after!.subTrips.flatMap((s) => s.activities);
  const google = activities.filter((a) => a.photoUrl.startsWith(`${SITE}/place-photo?place=ChIJ`));
  expect(google.length).toBeGreaterThan(0);
  expect(google.every((a) => a.photoCredit === "Kenji")).toBe(true);
  // Transport legs keep their stock photo.
  for (const a of activities.filter((a) => a.category === "transport")) expect(a.photoUrl.startsWith(SITE)).toBe(false);

  // Changing the photo clears the credit.
  const one = google[0]!;
  await t.mutation(api.activities.update, { activityId: one._id, patch: { photoUrl: "https://example.com/mine.jpg" } });
  const edited = (await t.query(api.trips.get, { tripId }))!.subTrips.flatMap((s) => s.activities).find((a) => a._id === one._id)!;
  expect(edited.photoCredit).toBeUndefined();
});

test("/place-photo redirects to a fresh Google photo and refuses bad ids", async () => {
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/media")) return json({ photoUri: "https://lh3.googleusercontent.com/photo.jpg" });
      return json({ photos: [{ name: "places/ChIJcevicheria0001/photos/abc" }] });
    }),
  );
  const t = convexTest(schema, modules);
  const ok = await t.fetch("/place-photo?place=ChIJcevicheria0001&w=800", { redirect: "manual" });
  expect(ok.status).toBe(302);
  expect(ok.headers.get("Location")).toBe("https://lh3.googleusercontent.com/photo.jpg");
  expect(urls[1]).toContain("maxWidthPx=800");

  expect((await t.fetch("/place-photo?place=../../etc", { redirect: "manual" })).status).toBe(400);
});
