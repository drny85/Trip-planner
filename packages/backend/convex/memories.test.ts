/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const ana = t.withIdentity({ subject: "ana", name: "Ana" });
  const ben = t.withIdentity({ subject: "ben", name: "Ben" });
  const tripId = await ana.mutation(api.seed.demoTrip, {});
  const token = await ana.mutation(api.members.createInvite, { tripId });
  await ben.mutation(api.members.join, { token });
  const activity = (await ana.query(api.trips.get, { tripId }))!.subTrips[0]!.activities[0]!;
  const upload = (type = "image/jpeg") => t.run((ctx) => ctx.storage.store(new Blob(["fake"], { type })));
  return { t, ana, ben, tripId, activity, upload };
}

describe("memories", () => {
  test("members add photos to an activity and everyone on the trip sees them", async () => {
    const { t, ana, ben, tripId, activity, upload } = await setup();
    await ben.mutation(api.memories.add, { activityId: activity._id, storageId: await upload(), caption: " Gate at dawn " });
    const photos = (await ana.query(api.memories.forTrip, { tripId }))!;
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ caption: "Gate at dawn", uploaderName: "Ben", activityTitle: activity.title, subTripId: activity.subTripId, canDelete: true });
    expect(photos[0]!.url).toMatch(/^https?:\/\//);
    expect(await t.withIdentity({ subject: "zed" }).query(api.memories.forTrip, { tripId })).toBeNull();
  });

  test("only images are accepted, and an upload can be attached once", async () => {
    const { ben, activity, upload } = await setup();
    await expect(ben.mutation(api.memories.add, { activityId: activity._id, storageId: await upload("application/pdf") })).rejects.toThrow(/images/);
    const id = await upload();
    await ben.mutation(api.memories.add, { activityId: activity._id, storageId: id });
    await expect(ben.mutation(api.memories.add, { activityId: activity._id, storageId: id })).rejects.toThrow(/already/);
  });

  test("uploader or organizer can delete; deleting the activity deletes its photos", async () => {
    const { t, ana, ben, tripId, activity, upload } = await setup();
    const mine = await ana.mutation(api.memories.add, { activityId: activity._id, storageId: await upload() });
    await expect(ben.mutation(api.memories.remove, { memoryId: mine })).rejects.toThrow(/Only the person/);
    await ben.mutation(api.memories.add, { activityId: activity._id, storageId: await upload() });
    await ana.mutation(api.activities.remove, { activityId: activity._id });
    expect(await ana.query(api.memories.forTrip, { tripId })).toEqual([]);
    expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(0);
  });
});
