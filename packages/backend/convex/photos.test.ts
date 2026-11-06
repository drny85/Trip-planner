/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { photoFor, photoPicker } from "./lib/photos";
import { keywords } from "./lib/wikiPhotos";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test("keywords keep the distinctive part of a place name", () => {
  expect(keywords("Visit Senso-ji Temple")).toEqual(["senso", "temple"]);
  expect(keywords("Toss a coin in the Trevi Fountain")).toEqual(["trevi", "fountain"]);
  expect(keywords("Jerónimos Monastery")).toEqual(["jeronimos", "monastery"]);
});

test("a page that only shares a generic word is not a match", async () => {
  const { findPlacePhoto } = await import("./lib/wikiPhotos");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ query: { pages: [{ title: "Sea cave", index: 1, thumbnail: { source: "https://upload.wikimedia.org/cave.jpg", width: 1200, height: 800 } }] } })),
    ),
  );
  expect(await findPlacePhoto("Lunch at Sea Me - Peixaria Moderna", "Lisbon, Portugal")).toBeNull();
  expect(await findPlacePhoto("LX Factory", "Lisbon, Portugal")).toBeNull();
});

test("a long name needs two of its words on the page, and Spanish place words don't count", async () => {
  const { findPlacePhoto } = await import("./lib/wikiPhotos");
  const page = (title: string) =>
    new Response(JSON.stringify({ query: { pages: [{ title, index: 1, thumbnail: { source: `https://upload.wikimedia.org/${title}.jpg`, width: 1200, height: 800 } }] } }));
  vi.stubGlobal("fetch", vi.fn(async () => page("San Cristóbal de La Laguna")));
  expect(await findPlacePhoto("Laguna Gri-Gri boat tour", "Río San Juan, Dominican Republic")).toBeNull();
  vi.stubGlobal("fetch", vi.fn(async () => page("Shibuya Scramble Square")));
  expect(await findPlacePhoto("Shibuya Sky observation deck", "Tokyo, Japan")).toBeNull();
  vi.stubGlobal("fetch", vi.fn(async () => page("Meiji Shrine")));
  expect(await findPlacePhoto("Meiji Jingu Shrine", "Tokyo, Japan")).toContain("Meiji Shrine");
});

test("stock photos follow the subcategory", () => {
  const train = "1474487548417-781cb71495f3";
  const pizza = "1565299624946-b28f40a0ae38";
  for (const seed of ["Transfer from Puerto Plata Airport", "Drive to Cabrera", "Rental car pickup"]) {
    expect(photoFor("transport", seed, 1000, "car")).not.toContain(train);
    expect(photoFor("food", seed, 1000, "lunch")).not.toContain(pizza);
  }
  expect(photoFor("transport", "Shinkansen to Kyoto", 1000, "train")).toContain(train);
  // Unknown or missing subcategories use the whole category.
  expect(photoFor("transport", "x", 1000)).toMatch(/images\.unsplash\.com/);
  const pick = photoPicker();
  expect(pick("food", "a", 1000, "cafe")).not.toBe(pick("food", "b", 1000, "cafe"));
});

test("enrichTrip swaps in Wikipedia photos only when the page matches the place", async () => {
  const searched: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const query = new URL(String(input)).searchParams.get("gsrsearch") ?? "";
      searched.push(query);
      const pages = query.startsWith("senso temple")
        ? [
            { title: "Tokyo", index: 1, thumbnail: { source: "https://upload.wikimedia.org/tokyo.jpg", width: 1200, height: 800 } },
            { title: "Sensō-ji", index: 2, thumbnail: { source: "https://upload.wikimedia.org/sensoji.jpg", width: 1200, height: 800 } },
          ]
        : query.startsWith("tokyo kyoto")
          ? [{ title: "Tokyo", index: 1, thumbnail: { source: "https://upload.wikimedia.org/tokyo-hero.jpg", width: 1600, height: 900 } }]
          : // Unrelated result: must not be used.
            [{ title: "Osaka Castle", index: 1, thumbnail: { source: "https://upload.wikimedia.org/osaka.jpg", width: 1200, height: 800 } }];
      return new Response(JSON.stringify({ query: { pages } }), { headers: { "content-type": "application/json" } });
    }),
  );

  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const tripId = await t.mutation(api.seed.demoTrip, {});
  const before = await t.query(api.trips.get, { tripId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const after = await t.query(api.trips.get, { tripId });

  expect(after?.imageUrl).toBe("https://upload.wikimedia.org/tokyo-hero.jpg");
  const all = (trip: typeof after) => trip!.subTrips.flatMap((s) => s.activities);
  const sensoji = all(after).find((a) => a.title === "Visit Senso-ji Temple")!;
  expect(sensoji.photoUrl).toBe("https://upload.wikimedia.org/sensoji.jpg");
  // Everything else got a non-matching page, so it keeps its original photo.
  const others = all(after).filter((a) => a.title !== "Visit Senso-ji Temple");
  expect(others.map((a) => a.photoUrl)).toEqual(
    all(before).filter((a) => a.title !== "Visit Senso-ji Temple").map((a) => a.photoUrl),
  );
  // Searches use the distinctive words plus the city, not the whole sentence.
  expect(searched).toContain("senso temple Tokyo");
  // Transport legs aren't searched.
  expect(searched.some((q) => /shinkansen/i.test(q))).toBe(false);
});

test("Google Places fills in places Wikipedia doesn't know, and /place-photo serves them", async () => {
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
  vi.stubEnv("CONVEX_SITE_URL", "https://demo.convex.site");
  const textQueries: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("wikipedia.org")) return new Response(JSON.stringify({ query: { pages: [] } }));
      if (url.endsWith("/places:searchText")) {
        const { textQuery } = JSON.parse(String(init?.body)) as { textQuery: string };
        textQueries.push(textQuery);
        // Only the tempura place has Google photos in this test.
        const places = textQuery.startsWith("Tempura lunch at Daikokuya")
          ? [
              // A different business that happens to come first must be skipped.
              { id: "ChIJotherplace", displayName: { text: "Some Other Bar" }, photos: [{ name: "places/ChIJotherplace/photos/x" }] },
              { id: "ChIJdaikokuya", displayName: { text: "Daikokuya Tempura" }, photos: [{ name: "places/ChIJdaikokuya/photos/abc", authorAttributions: [{ displayName: "Aiko T." }] }] },
            ]
          : [];
        return new Response(JSON.stringify({ places }));
      }
      if (url.endsWith("/places/ChIJdaikokuya")) {
        return new Response(JSON.stringify({ photos: [{ name: "places/ChIJdaikokuya/photos/fresh" }] }));
      }
      if (url.includes("/places/ChIJdaikokuya/photos/fresh/media")) {
        expect(url).toContain("maxWidthPx=1000");
        return new Response(JSON.stringify({ photoUri: "https://lh3.googleusercontent.com/tempura" }));
      }
      return new Response("unexpected", { status: 500 });
    }),
  );

  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const tripId = await t.mutation(api.seed.demoTrip, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const after = await t.query(api.trips.get, { tripId });
  const all = after!.subTrips.flatMap((s) => s.activities);

  const tempura = all.find((a) => a.title === "Tempura lunch at Daikokuya")!;
  expect(tempura.photoUrl).toBe("https://demo.convex.site/place-photo/ChIJdaikokuya?w=1000");
  expect(tempura.photoCredit).toBe("Aiko T.");
  // Hotels are looked up on Google (not on Wikipedia); train rides on neither.
  expect(textQueries.some((q) => q.includes("Gion machiya"))).toBe(true);
  expect(textQueries.some((q) => /shinkansen/i.test(q))).toBe(false);

  const res = await t.fetch("/place-photo/ChIJdaikokuya?w=1000");
  expect(res.status).toBe(302);
  expect(res.headers.get("Location")).toBe("https://lh3.googleusercontent.com/tempura");
  // A place we never matched isn't served, so the route can't spend our quota.
  expect((await t.fetch("/place-photo/ChIJsomewhereElse")).status).toBe(404);

  // Picking a new photo drops the old photographer's credit.
  await t.withIdentity({ subject: "demo-user" }).mutation(api.activities.update, { activityId: tempura._id, patch: { photoUrl: "https://example.com/mine.jpg" } });
  const edited = (await t.query(api.trips.get, { tripId }))!.subTrips.flatMap((s) => s.activities).find((a) => a._id === tempura._id)!;
  expect(edited.photoCredit).toBeUndefined();
});

test("placeName drops lead-in words", async () => {
  const { placeName } = await import("./lib/googlePlaces");
  expect(placeName("Dinner at A Cevicheria")).toBe("A Cevicheria");
  expect(placeName("Lunch at Time Out Market")).toBe("Time Out Market");
  expect(placeName("LX Factory")).toBe("LX Factory");
});

test("decodeEntities turns HTML entities back into text", async () => {
  const { decodeEntities } = await import("./lib/text");
  expect(decodeEntities("Arrival &amp; Historic Alfama Walk")).toBe("Arrival & Historic Alfama Walk");
  expect(decodeEntities("Caf&#233; &quot;A Brasileira&quot;")).toBe('Café "A Brasileira"');
  expect(decodeEntities("Fish & chips &unknown;")).toBe("Fish & chips &unknown;");
});
