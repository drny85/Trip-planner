/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { applyPendingToPacking, applyPendingToTrip, enqueue, pendingKey, settle, tripPhotoUrls, type PendingCheck } from "../src/offline";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { flatten } from "./lib/tree";
import { pickUpNext } from "./lib/upNext";
import type { TripDetails } from "./lib/types";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seeded() {
  const t = convexTest(schema, modules);
  const tripId = await t.mutation(api.seed.demoTrip, {});
  const get = async () => (await t.query(api.trips.get, { tripId }))!;
  return { t, tripId, get };
}

/** Just the done flags, to compare the phone's guess with what the server did. */
const doneMap = (trip: TripDetails) =>
  Object.fromEntries(trip.subTrips.flatMap((s) => flatten(s.activities)).map((a) => [a._id, a.isCompleted]));

const check = (tripId: Id<"trips">, activityId: Id<"activities">, isCompleted: boolean, at: number): PendingCheck => ({
  kind: "activity",
  tripId,
  activityId,
  isCompleted,
  at,
});

describe("offline outbox", () => {
  test("a later tap on the same item replaces the earlier one and moves to the end", () => {
    const tripId = "t" as Id<"trips">;
    const a = "a" as Id<"activities">;
    const b = "b" as Id<"activities">;
    let q: PendingCheck[] = [];
    q = enqueue(q, check(tripId, a, true, 1));
    q = enqueue(q, check(tripId, b, true, 2));
    q = enqueue(q, check(tripId, a, false, 3));
    expect(q.map((o) => [pendingKey(o), o.at])).toEqual([
      ["activity:b", 2],
      ["activity:a", 3],
    ]);
    // Settling the older tap on "a" keeps the newer one.
    expect(settle(q, check(tripId, a, true, 1))).toHaveLength(2);
    expect(settle(q, q[1]!)).toHaveLength(1);
  });

  test("the saved copy shows queued check-offs exactly as the server applies them", async () => {
    const { t, tripId, get } = await seeded();
    const before = await get();
    const parent = before.subTrips.flatMap((s) => s.activities).find((a) => a.children.length > 0)!;
    const child = parent.children[0]!;
    const other = before.subTrips[1]!.activities[0]!;

    // Offline: the stop is marked done (with its steps), one step reopened, another stop done.
    let q: PendingCheck[] = [];
    q = enqueue(q, check(tripId, parent._id, true, 1));
    q = enqueue(q, check(tripId, child._id, false, 2));
    q = enqueue(q, check(tripId, other._id, true, 3));
    const predicted = applyPendingToTrip(before, q);

    expect(predicted.subTrips.flatMap((s) => flatten(s.activities)).find((a) => a._id === parent._id)!.isCompleted).toBe(false);

    // Back online: the outbox replays in order.
    for (const op of q) if (op.kind === "activity") await t.mutation(api.activities.setCompleted, { activityId: op.activityId, isCompleted: op.isCompleted });
    const after = await get();
    expect(doneMap(predicted)).toEqual(doneMap(after));
    expect(predicted.progress).toEqual(after.progress);
  });

  test("up next moves past a stop checked off offline", async () => {
    const { tripId, get } = await seeded();
    const trip = await get();
    const today = trip.startDate;
    const first = pickUpNext(trip, today)!;
    const after = pickUpNext(applyPendingToTrip(trip, [check(tripId, first.activity._id, true, 1)]), today)!;
    expect(after.activity._id).not.toBe(first.activity._id);
    expect(after.activity._id).toBe(first.later[0]!.activity._id);
  });

  test("check-offs for another trip leave this one alone", async () => {
    const { tripId, get } = await seeded();
    const trip = await get();
    const a = trip.subTrips[0]!.activities[0]!;
    const q = [check("elsewhere" as Id<"trips">, a._id, true, 1)];
    expect(applyPendingToTrip(trip, q)).toBe(trip);
    expect(applyPendingToTrip(null, [check(tripId, a._id, true, 1)])).toBeNull();
  });

  test("packed items flip on the saved list", async () => {
    const { t, tripId } = await seeded();
    await t.mutation(api.packing.add, { tripId, text: "Passport" });
    const items = (await t.query(api.packing.list, { tripId }))!;
    const item = items[0]!;
    const q: PendingCheck[] = [{ kind: "packing", tripId, itemId: item._id, isPacked: !item.isPacked, at: 1 }];
    const predicted = applyPendingToPacking(items, q)!;
    await t.mutation(api.packing.toggle, { itemId: item._id, isPacked: !item.isPacked });
    expect(predicted.map((i) => i.isPacked)).toEqual((await t.query(api.packing.list, { tripId }))!.map((i) => i.isPacked));
    expect(applyPendingToPacking(items, [])).toBe(items);
  });

  test("collects the trip's photos to keep on the phone", async () => {
    const { get } = await seeded();
    const trip = await get();
    const urls = tripPhotoUrls(trip);
    expect(urls.length).toBeGreaterThan(1);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((u) => u.startsWith("http"))).toBe(true);
  });
});
