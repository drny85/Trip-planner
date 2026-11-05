/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { buildTree, flatten } from "./lib/tree";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const base = { description: "", address: "Tokyo", photoUrl: "https://picsum.photos/seed/x/800/600" };

async function seeded() {
  const t = convexTest(schema, modules);
  const tripId = await t.mutation(api.seed.demoTrip, {});
  const get = async () => (await t.query(api.trips.get, { tripId }))!;
  return { t, tripId, get };
}

describe("sub-activities", () => {
  test("seed nests sub-activities under their parent", async () => {
    const { get } = await seeded();
    const tsukiji = (await get()).subTrips[2]!.activities[0]!;
    expect(tsukiji.title).toBe("Tsukiji Outer Market breakfast");
    expect(tsukiji.subcategory).toBe("breakfast");
    expect(tsukiji.children.map((c) => c.order)).toEqual([0, 1, 2]);
    expect(tsukiji.children[0]).toMatchObject({ title: "Tamagoyaki at Yamacho", parentId: tsukiji._id, children: [] });
  });

  test("create nests to any depth and orders per parent", async () => {
    const { t, get } = await seeded();
    const day = (await get()).subTrips[0]!;
    const parent = day.activities[0]!;
    const child = await t.mutation(api.activities.create, { ...base, subTripId: day._id, parentId: parent._id, title: "Child" });
    const grandchild = await t.mutation(api.activities.create, { ...base, subTripId: day._id, parentId: child, title: "Grandchild" });
    await t.mutation(api.activities.create, { ...base, subTripId: day._id, parentId: child, title: "Grandchild 2" });

    const node = (await get()).subTrips[0]!.activities[0]!;
    expect(node.children[0]!.title).toBe("Child");
    expect(node.children[0]!.children.map((c) => [c.title, c.order])).toEqual([["Grandchild", 0], ["Grandchild 2", 1]]);
    expect(node.children[0]!.children[0]!._id).toBe(grandchild);
    // Top level is untouched.
    expect((await get()).subTrips[0]!.activities).toHaveLength(4);
  });

  test("a parent on another day is rejected", async () => {
    const { t, get } = await seeded();
    const [day1, day2] = (await get()).subTrips;
    await expect(
      t.mutation(api.activities.create, { ...base, subTripId: day2!._id, parentId: day1!.activities[0]!._id, title: "x" }),
    ).rejects.toThrow(/same day/);
  });

  test("completing a parent completes its subtree; reopening a child reopens ancestors", async () => {
    const { t, get } = await seeded();
    const tsukiji = (await get()).subTrips[2]!.activities[0]!;
    await t.mutation(api.activities.setCompleted, { activityId: tsukiji._id, isCompleted: true });
    let node = (await get()).subTrips[2]!.activities[0]!;
    expect(flatten([node]).every((n) => n.isCompleted)).toBe(true);
    expect((await get()).progress.completed).toBe(4);

    await t.mutation(api.activities.setCompleted, { activityId: node.children[1]!._id, isCompleted: false });
    node = (await get()).subTrips[2]!.activities[0]!;
    expect(node.isCompleted).toBe(false);
    expect(node.children.map((c) => c.isCompleted)).toEqual([true, false, true]);
  });

  test("move promotes, demotes and carries the subtree to another day", async () => {
    const { t, get } = await seeded();
    let trip = await get();
    const tsukiji = trip.subTrips[2]!.activities[0]!;
    const day1 = trip.subTrips[0]!;

    // Demote Senso-ji under Tsukiji (day 3) at index 0: whole subtree moves days.
    await t.mutation(api.activities.move, {
      activityId: day1.activities[0]!._id,
      toSubTripId: tsukiji.subTripId,
      toParentId: tsukiji._id,
      toIndex: 0,
    });
    trip = await get();
    expect(trip.subTrips[0]!.activities.map((a) => a.order)).toEqual([0, 1, 2]);
    const kids = trip.subTrips[2]!.activities[0]!.children;
    expect(kids.map((k) => k.title)).toEqual(["Visit Senso-ji Temple", "Tamagoyaki at Yamacho", "Tuna and sushi stalls", "Matcha at a market cafe"]);
    expect(kids.map((k) => k.order)).toEqual([0, 1, 2, 3]);

    // Promote a child to the top level of day 1.
    await t.mutation(api.activities.move, { activityId: kids[1]!._id, toSubTripId: day1._id, toIndex: 0 });
    trip = await get();
    expect(trip.subTrips[0]!.activities[0]!.title).toBe("Tamagoyaki at Yamacho");
    expect(trip.subTrips[0]!.activities[0]!.parentId).toBeUndefined();
    expect(trip.subTrips[2]!.activities[0]!.children.map((k) => k.order)).toEqual([0, 1, 2]);

    // Moving Tsukiji (with children) to day 2 brings the children along.
    await t.mutation(api.activities.move, { activityId: tsukiji._id, toSubTripId: trip.subTrips[1]!._id, toIndex: 0 });
    const rows = await t.run((ctx) => ctx.db.query("activities").collect());
    const moved = buildTree(rows.filter((r) => r.subTripId === trip.subTrips[1]!._id))[0]!;
    expect(moved.title).toBe("Tsukiji Outer Market breakfast");
    expect(flatten(moved.children)).toHaveLength(3);
  });

  test("an activity can't move inside itself", async () => {
    const { t, get } = await seeded();
    const tsukiji = (await get()).subTrips[2]!.activities[0]!;
    await expect(
      t.mutation(api.activities.move, {
        activityId: tsukiji._id,
        toSubTripId: tsukiji.subTripId,
        toParentId: tsukiji.children[0]!._id,
        toIndex: 0,
      }),
    ).rejects.toThrow(/inside itself/);
  });

  test("remove deletes the whole subtree and renumbers siblings", async () => {
    const { t, get } = await seeded();
    const tsukiji = (await get()).subTrips[2]!.activities[0]!;
    await t.mutation(api.activities.create, { ...base, subTripId: tsukiji.subTripId, parentId: tsukiji.children[0]!._id, title: "Deep" });
    await t.mutation(api.activities.remove, { activityId: tsukiji.children[0]!._id });
    expect((await get()).subTrips[2]!.activities[0]!.children.map((c) => [c.title, c.order])).toEqual([
      ["Tuna and sushi stalls", 0],
      ["Matcha at a market cafe", 1],
    ]);
    await t.mutation(api.activities.remove, { activityId: tsukiji._id });
    const left = await t.run((ctx) => ctx.db.query("activities").collect());
    expect(left.some((a) => a.title === "Deep" || a.title.startsWith("Tuna"))).toBe(false);
  });

  test("subcategory must fit the category", async () => {
    const { t, get } = await seeded();
    const day = (await get()).subTrips[0]!;
    const id = await t.mutation(api.activities.create, { ...base, subTripId: day._id, title: "Hotel", category: "lodging", subcategory: "airbnb" });
    const bad = await t.mutation(api.activities.create, { ...base, subTripId: day._id, title: "Odd", category: "food", subcategory: "hotel" });
    await t.mutation(api.activities.update, { activityId: id, patch: { category: "food" } });
    const rows = await t.run((ctx) => ctx.db.query("activities").collect());
    expect(rows.find((r) => r._id === bad)?.subcategory).toBeUndefined();
    const changed = rows.find((r) => r._id === id)!;
    expect([changed.category, changed.subcategory]).toEqual(["food", undefined]);
    await t.mutation(api.activities.update, { activityId: id, patch: { subcategory: "dinner" } });
    expect((await t.run((ctx) => ctx.db.get("activities", id)))?.subcategory).toBe("dinner");
  });
});
