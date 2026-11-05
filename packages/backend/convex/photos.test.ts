/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { keywords } from "./lib/wikiPhotos";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("keywords keep the distinctive part of a place name", () => {
  expect(keywords("Visit Senso-ji Temple")).toEqual(["senso", "temple"]);
  expect(keywords("Toss a coin in the Trevi Fountain")).toEqual(["trevi", "fountain"]);
  expect(keywords("Jerónimos Monastery")).toEqual(["jeronimos", "monastery"]);
});

test("enrichTrip swaps in Wikipedia photos only when the page matches the place", async () => {
  const searched: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const query = new URL(String(input)).searchParams.get("gsrsearch") ?? "";
      searched.push(query);
      const pages = query.startsWith("Visit Senso-ji Temple")
        ? [
            { title: "Tokyo", index: 1, thumbnail: { source: "https://upload.wikimedia.org/tokyo.jpg", width: 1200, height: 800 } },
            { title: "Sensō-ji", index: 2, thumbnail: { source: "https://upload.wikimedia.org/sensoji.jpg", width: 1200, height: 800 } },
          ]
        : query.startsWith("Tokyo & Kyoto")
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
  // Transport legs aren't searched.
  expect(searched.some((q) => /shinkansen/i.test(q))).toBe(false);
});
