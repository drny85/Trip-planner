/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seeded() {
  const t = convexTest(schema, modules);
  const tripId = await t.mutation(api.seed.demoTrip, {});
  return { t, tripId };
}

describe("trips", () => {
  test("seed creates the demo trip tree in order", async () => {
    const { t, tripId } = await seeded();
    const trip = await t.query(api.trips.get, { tripId });

    expect(trip?.title).toBe("Tokyo Adventure");
    expect(trip?.subTrips.map((s) => s.dayNumber)).toEqual([1, 2, 3, 4]);
    expect(trip?.subTrips[0]?.activities[0]?.title).toBe("Visit Senso-ji Temple");
    expect(trip?.progress).toEqual({ completed: 0, total: 20 });
    expect(await t.query(api.trips.list, {})).toHaveLength(1);
  });

  test("other users cannot see the trip", async () => {
    const { t, tripId } = await seeded();
    const asOther = t.withIdentity({ subject: "someone-else" });
    expect(await asOther.query(api.trips.get, { tripId })).toBeNull();
    await expect(asOther.mutation(api.trips.remove, { tripId })).rejects.toThrow();
  });

  test("share links give read-only access and can be revoked", async () => {
    const { t, tripId } = await seeded();
    const token = await t.mutation(api.trips.share, { tripId });
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(await t.mutation(api.trips.share, { tripId })).toBe(token);

    const stranger = t.withIdentity({ subject: "stranger" });
    const shared = await stranger.query(api.trips.getShared, { token });
    expect(shared?.title).toBe("Tokyo Adventure");
    expect(shared?.subTrips).toHaveLength(4);
    expect(shared).not.toHaveProperty("userId");
    expect(shared).not.toHaveProperty("shareToken");
    await expect(stranger.mutation(api.trips.share, { tripId })).rejects.toThrow();
    expect(await stranger.query(api.trips.getShared, { token: "0".repeat(32) })).toBeNull();

    await t.mutation(api.trips.unshare, { tripId });
    expect(await stranger.query(api.trips.getShared, { token })).toBeNull();
  });

  test("remove deletes days and activities", async () => {
    const { t, tripId } = await seeded();
    await t.mutation(api.trips.remove, { tripId });
    const counts = await t.run(async (ctx) => ({
      subTrips: (await ctx.db.query("subTrips").collect()).length,
      activities: (await ctx.db.query("activities").collect()).length,
    }));
    expect(counts).toEqual({ subTrips: 0, activities: 0 });
  });
});

describe("activities", () => {
  test("setCompleted toggles and updates progress", async () => {
    const { t, tripId } = await seeded();
    const first = (await t.query(api.trips.get, { tripId }))!.subTrips[0]!.activities[0]!;

    await t.mutation(api.activities.setCompleted, { activityId: first._id, isCompleted: true });
    let trip = await t.query(api.trips.get, { tripId });
    expect(trip?.subTrips[0]?.activities[0]?.isCompleted).toBe(true);
    expect(trip?.progress.completed).toBe(1);

    await t.mutation(api.activities.setCompleted, { activityId: first._id, isCompleted: false });
    trip = await t.query(api.trips.get, { tripId });
    expect(trip?.subTrips[0]?.activities[0]?.completedAt).toBeUndefined();
  });

  test("move reorders within a day", async () => {
    const { t, tripId } = await seeded();
    const day1 = (await t.query(api.trips.get, { tripId }))!.subTrips[0]!;
    const before = day1.activities.map((a) => a.title);

    await t.mutation(api.activities.move, {
      activityId: day1.activities[0]!._id,
      toSubTripId: day1._id,
      toIndex: 2,
    });

    const after = (await t.query(api.trips.get, { tripId }))!.subTrips[0]!.activities;
    expect(after.map((a) => a.title)).toEqual([before[1], before[2], before[0], before[3]]);
    expect(after.map((a) => a.order)).toEqual([0, 1, 2, 3]);
  });

  test("move across days renumbers both days", async () => {
    const { t, tripId } = await seeded();
    const [day1, day2] = (await t.query(api.trips.get, { tripId }))!.subTrips;
    const moving = day1!.activities[1]!;

    await t.mutation(api.activities.move, {
      activityId: moving._id,
      toSubTripId: day2!._id,
      toIndex: 0,
    });

    const [newDay1, newDay2] = (await t.query(api.trips.get, { tripId }))!.subTrips;
    expect(newDay1!.activities).toHaveLength(3);
    expect(newDay1!.activities.map((a) => a.order)).toEqual([0, 1, 2]);
    expect(newDay2!.activities[0]?.title).toBe(moving.title);
    expect(newDay2!.activities.map((a) => a.order)).toEqual([0, 1, 2, 3, 4]);
  });

  test("create appends, update patches, remove closes the gap", async () => {
    const { t, tripId } = await seeded();
    const day1 = (await t.query(api.trips.get, { tripId }))!.subTrips[0]!;

    const id = await t.mutation(api.activities.create, {
      subTripId: day1._id,
      title: "Late ramen",
      description: "Ichiran",
      address: "Shibuya",
      photoUrl: "https://picsum.photos/seed/ramen/800/600",
    });
    await t.mutation(api.activities.update, { activityId: id, patch: { title: "Late-night ramen" } });
    let activities = (await t.query(api.trips.get, { tripId }))!.subTrips[0]!.activities;
    expect(activities.at(-1)).toMatchObject({ title: "Late-night ramen", order: 4 });

    await t.mutation(api.activities.remove, { activityId: activities[0]!._id });
    activities = (await t.query(api.trips.get, { tripId }))!.subTrips[0]!.activities;
    expect(activities.map((a) => a.order)).toEqual([0, 1, 2, 3]);
  });
});
