/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { daysBetween, isIsoDate, shiftDate } from "./lib/copyTrip";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function sharedTrip() {
  const t = convexTest(schema, modules);
  const tripId = await t.mutation(api.seed.demoTrip, {});
  const token = await t.mutation(api.trips.share, { tripId });
  return { t, tripId, token };
}

describe("date helpers", () => {
  test("shift and count days across months and leap years", () => {
    expect(shiftDate("2028-02-27", 3)).toBe("2028-03-01");
    expect(shiftDate("2027-01-05", -10)).toBe("2026-12-26");
    expect(daysBetween("2026-11-05", "2027-01-01")).toBe(57);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("next week")).toBe(false);
  });
});

describe("Use this trip", () => {
  test("copies a shared trip to the viewer, moved to their dates, with nothing checked off", async () => {
    const { t, tripId, token } = await sharedTrip();
    const original = (await t.query(api.trips.get, { tripId }))!;
    // Some progress on the original that must not come along.
    const first = original.subTrips[0]!.activities[0]!;
    await t.mutation(api.activities.setCompleted, { activityId: first._id, isCompleted: true });

    const viewer = t.withIdentity({ subject: "viewer", name: "Vera" });
    const copyId = await viewer.mutation(api.trips.copyShared, { token, startDate: "2027-04-10" });
    const copy = (await viewer.query(api.trips.get, { tripId: copyId }))!;

    const length = daysBetween(original.startDate, original.endDate);
    expect(copy.userId).toBe("viewer");
    expect(copy.myRole).toBe("owner");
    expect(copy.title).toBe(original.title);
    expect(copy.startDate).toBe("2027-04-10");
    expect(copy.endDate).toBe(shiftDate("2027-04-10", length));
    expect(copy.subTrips.map((d) => d.title)).toEqual(original.subTrips.map((d) => d.title));
    const offset = daysBetween(original.startDate, "2027-04-10");
    copy.subTrips.forEach((d, i) => {
      const was = original.subTrips[i]!.date;
      expect(d.date).toBe(was && shiftDate(was, offset));
    });
    expect(copy.progress).toEqual({ completed: 0, total: (await t.query(api.trips.get, { tripId }))!.progress.total });
    expect(copy.subTrips[0]!.activities[0]!.title).toBe(first.title);
    expect(copy.shareToken).toBeUndefined();

    // Only the viewer is on the copy, and the original is untouched.
    const members = await t.run((ctx) => ctx.db.query("tripMembers").withIndex("by_tripId", (q) => q.eq("tripId", copyId)).collect());
    expect(members.map((m) => [m.userId, m.role, m.name])).toEqual([["viewer", "owner", "Vera"]]);
    expect((await t.query(api.trips.get, { tripId }))!.progress.completed).toBe(1);
    expect(await viewer.query(api.trips.list, {})).toHaveLength(1);
  });

  test("copies every level of sub-activities with their parents remapped", async () => {
    const { t, tripId, token } = await sharedTrip();
    const original = await t.run(async (ctx) => {
      const all = await ctx.db.query("activities").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect();
      const child = all.find((a) => a.parentId)!;
      const { _id, _creationTime, ...fields } = child;
      await ctx.db.insert("activities", { ...fields, title: "Grandchild", parentId: _id, order: 0 });
      return all.length + 1;
    });
    const copyId = await t.withIdentity({ subject: "viewer" }).mutation(api.trips.copyShared, { token, startDate: "2027-01-01" });
    const copied = await t.run((ctx) => ctx.db.query("activities").withIndex("by_tripId", (q) => q.eq("tripId", copyId)).collect());
    expect(copied).toHaveLength(original);
    const ids = new Set(copied.map((a) => a._id));
    expect(copied.every((a) => !a.parentId || ids.has(a.parentId))).toBe(true);
    const grandchild = copied.find((a) => a.title === "Grandchild")!;
    expect(copied.find((a) => a._id === grandchild.parentId)?.parentId).toBeDefined();
  });

  test("needs a live share link and a real date", async () => {
    const { t, tripId, token } = await sharedTrip();
    const viewer = t.withIdentity({ subject: "viewer" });
    await expect(viewer.mutation(api.trips.copyShared, { token, startDate: "soon" })).rejects.toThrow("Pick a start date");
    await expect(viewer.mutation(api.trips.copyShared, { token: "0".repeat(32), startDate: "2027-01-01" })).rejects.toThrow("turned off");
    await t.mutation(api.trips.unshare, { tripId });
    await expect(viewer.mutation(api.trips.copyShared, { token, startDate: "2027-01-01" })).rejects.toThrow("turned off");
  });

  test("the share link doesn't expose where a trip was copied from or its booking address", async () => {
    const { t, token } = await sharedTrip();
    const viewer = t.withIdentity({ subject: "viewer" });
    const copyId = await viewer.mutation(api.trips.copyShared, { token, startDate: "2027-01-01" });
    const copyToken = await viewer.mutation(api.trips.share, { tripId: copyId });
    await t.run((ctx) => ctx.db.patch("trips", copyId, { importToken: "secret-import-token" }));
    const shared = await t.withIdentity({ subject: "someone" }).query(api.trips.getShared, { token: copyToken });
    expect(shared).not.toHaveProperty("copiedFromTripId");
    expect(shared).not.toHaveProperty("importToken");
  });
});
