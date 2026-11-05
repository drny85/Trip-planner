/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("applying a re-plan keeps, re-times, adds and removes, but never drops photos", async () => {
  const t = convexTest(schema, modules);
  const ana = t.withIdentity({ subject: "ana", name: "Ana" });
  const tripId = await ana.mutation(api.seed.demoTrip, {});
  const day = (await ana.query(api.trips.get, { tripId }))!.subTrips[0]!;
  const [first, second, third, ...rest] = day.activities;
  expect(rest.length).toBeGreaterThanOrEqual(0);

  // A photo on the third stop means it must survive even though the plan drops it.
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"], { type: "image/png" })));
  await ana.mutation(api.memories.add, { activityId: third!._id, storageId });

  await ana.mutation(api.activities.applyReplan, {
    subTripId: day._id,
    activities: [
      { keepId: second!._id, startTime: "09:00", durationMinutes: 60 },
      { title: "teamLab Planets", description: "Indoor art", address: "Toyosu", photoUrl: "https://picsum.photos/seed/t/800/600", category: "sightseeing", startTime: "11:00", durationMinutes: 120 },
      { keepId: first!._id, startTime: "14:00", durationMinutes: 90 },
    ],
  });

  const after = (await ana.query(api.trips.get, { tripId }))!.subTrips[0]!.activities;
  expect(after.map((a) => [a.title, a.startTime])).toEqual([
    [second!.title, "09:00"],
    ["teamLab Planets", "11:00"],
    [first!.title, "14:00"],
    [third!.title, third!.startTime],
  ]);

  const ben = t.withIdentity({ subject: "ben", name: "Ben" });
  await expect(ben.mutation(api.activities.applyReplan, { subTripId: day._id, activities: [] })).rejects.toThrow();
});
