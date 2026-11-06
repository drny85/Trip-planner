/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { checkPlan, fairRanking, isDropCandidate, personPoints, tallyVotes, type VoteRow, votesOnlyPlan } from "./lib/groupVotes";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** Owner Ana with the demo trip, plus Ben and Cy who joined with the invite link. */
async function crew() {
  const t = convexTest(schema, modules);
  const ana = t.withIdentity({ subject: "ana", name: "Ana" });
  const tripId = await ana.mutation(api.seed.demoTrip, {});
  const token = await ana.mutation(api.members.createInvite, { tripId });
  const ben = t.withIdentity({ subject: "ben", name: "Ben" });
  const cy = t.withIdentity({ subject: "cy", name: "Cy" });
  for (const p of [ben, cy]) await p.mutation(api.members.join, { token });
  const trip = (await ana.query(api.trips.get, { tripId }))!;
  const stops = trip.subTrips.flatMap((d) => d.activities.filter((a) => a.category !== "transport"));
  return { t, ana, ben, cy, tripId, trip, stops };
}

describe("scoring", () => {
  test("points: 👎 -1, 👍 +1, picks 4/3/2", () => {
    expect([personPoints({ value: "down" }), personPoints({ value: "up" }), personPoints({ pick: 1 }), personPoints({ pick: 2 }), personPoints({ pick: 3 })]).toEqual([-1, 1, 4, 3, 2]);
  });

  test("votes from people who left don't count", () => {
    const votes: VoteRow[] = [
      { activityId: "a", userId: "ana", value: "up" },
      { activityId: "a", userId: "gone", value: "down" },
    ];
    expect(tallyVotes(votes, ["ana"]).get("a")).toMatchObject({ up: 1, down: 0, score: 1 });
  });

  test("a stop is only voted out with no stars, more 👎 than 👍 and half the group against", () => {
    const tally = (up: number, down: number, picks = 0) => ({ activityId: "x", up, down, picks, firstPicks: 0, score: up - down, supporters: [] });
    expect(isDropCandidate(tally(0, 2), 4)).toBe(true);
    expect(isDropCandidate(tally(0, 1), 4)).toBe(false);
    expect(isDropCandidate(tally(2, 2), 4)).toBe(false);
    expect(isDropCandidate(tally(1, 3, 1), 4)).toBe(false);
  });

  test("ties go to the people whose favorites have made it in least", () => {
    // Ana likes A and B; Ben likes C. A wins outright. B and C then tie on score,
    // and C wins because Ben has nothing yet while Ana already has A.
    const votes: VoteRow[] = [
      { activityId: "A", userId: "ana", pick: 1 },
      { activityId: "B", userId: "ana", value: "up" },
      { activityId: "C", userId: "ben", value: "up" },
    ];
    const ranked = fairRanking(["A", "B", "C"], tallyVotes(votes, ["ana", "ben"]), votes);
    expect(ranked.map((r) => r.activityId)).toEqual(["A", "C", "B"]);
    expect(ranked[1]!.tieBrokenBy).toBe("fairness");
  });
});

describe("checkPlan", () => {
  const input = [
    { id: "d1", activities: [{ id: "a", locked: false, done: true, startTime: "09:00" }, { id: "b", locked: false, done: false }, { id: "h", locked: true, done: false }] },
    { id: "d2", activities: [{ id: "c", locked: false, done: false }, { id: "x", locked: false, done: false }] },
  ];

  test("keeps every stop exactly once and only drops what the group voted out", () => {
    const plan = checkPlan(
      input,
      {
        days: [
          { dayId: "d1", activities: [{ id: "c", startTime: "10:00" }, { id: "a", startTime: "07:00" }] },
          { dayId: "d2", activities: [{ id: "h", startTime: "12:00" }, { id: "zzz" }] },
        ],
        dropped: [{ id: "b", reason: "nope" }, { id: "x", reason: "Two of three voted it down" }],
      },
      new Set(["x"]),
    );
    // c moved to day 1; a (done) keeps its time; b couldn't be dropped and comes back; h (locked) stays on day 1.
    expect(plan.days[0]!.items).toEqual([
      { activityId: "c", startTime: "10:00", movedFrom: "d2" },
      { activityId: "a", startTime: "09:00", movedFrom: undefined },
      { activityId: "b", startTime: undefined },
      { activityId: "h", startTime: undefined },
    ]);
    expect(plan.days[1]!.items).toEqual([]);
    expect(plan.dropped).toEqual([{ activityId: "x", reason: "Two of three voted it down" }]);
  });

  test("without AI only the voted-out stops go", () => {
    const plan = votesOnlyPlan(input, new Set(["x"]));
    expect(plan.days.map((d) => d.items.map((i) => i.activityId))).toEqual([["a", "b", "h"], ["c"]]);
    expect(plan.dropped.map((d) => d.activityId)).toEqual(["x"]);
  });
});

describe("group votes", () => {
  test("members vote and star up to three; strangers can't", async () => {
    const { t, ben, tripId, stops } = await crew();
    const [s1, s2, s3, s4] = stops;
    await ben.mutation(api.groupVotes.vote, { activityId: s1!._id, value: "up" });
    for (const s of [s2, s3, s4].slice(0, 3)) await ben.mutation(api.groupVotes.setPick, { activityId: s!._id, picked: true });
    await expect(ben.mutation(api.groupVotes.setPick, { activityId: s1!._id, picked: true })).rejects.toThrow(/3 top picks/);

    let data = (await ben.query(api.groupVotes.forTrip, { tripId }))!;
    expect(data.picksLeft).toBe(0);
    expect(data.byActivity[s4!._id]).toMatchObject({ myPick: 3, score: 2 });

    // A 👎 takes the star away and the other picks close the gap.
    await ben.mutation(api.groupVotes.vote, { activityId: s2!._id, value: "down" });
    data = (await ben.query(api.groupVotes.forTrip, { tripId }))!;
    expect([data.byActivity[s2!._id]!.myPick, data.byActivity[s3!._id]!.myPick, data.byActivity[s4!._id]!.myPick]).toEqual([undefined, 1, 2]);
    expect(data.ranking[0]!.activityId).toBe(s3!._id);

    const zed = t.withIdentity({ subject: "zed", name: "Zed" });
    expect(await zed.query(api.groupVotes.forTrip, { tripId })).toBeNull();
    await expect(zed.mutation(api.groupVotes.vote, { activityId: s1!._id, value: "up" })).rejects.toThrow();
  });

  test("the organizer rebuilds the plan from the votes; voted-out stops go, everyone's #1 stays", async () => {
    const { ana, ben, cy, tripId, stops } = await crew();
    const [fav, out] = stops;
    await ben.mutation(api.groupVotes.vote, { activityId: out!._id, value: "down" });
    await cy.mutation(api.groupVotes.vote, { activityId: out!._id, value: "down" });
    await cy.mutation(api.groupVotes.setPick, { activityId: fav!._id, picked: true });

    await expect(ben.action(api.groupVotes.buildPlan, { tripId })).rejects.toThrow();
    // No AI key in tests: the plan only drops what was voted out.
    const plan = await ana.action(api.groupVotes.buildPlan, { tripId });
    expect(plan.summary).toBeNull();
    expect(plan.dropped.map((d) => d.activityId)).toEqual([out!._id]);

    // A hand-made plan can't drop someone's #1 pick.
    await ana.mutation(api.groupVotes.applyPlan, {
      tripId,
      days: plan.days.map((d) => ({ subTripId: d.subTripId as never, items: d.items.map((i) => ({ activityId: i.activityId as never, startTime: i.startTime })) })),
      drop: [out!._id, fav!._id],
    });
    const after = (await ana.query(api.trips.get, { tripId }))!;
    const ids = after.subTrips.flatMap((d) => d.activities.map((a) => a._id));
    expect(ids).toContain(fav!._id);
    expect(ids).not.toContain(out!._id);
    // The dropped stop's votes are gone too.
    expect((await ana.query(api.groupVotes.forTrip, { tripId }))!.byActivity[out!._id]).toBeUndefined();
  });

  test("leaving the trip takes your votes with you", async () => {
    const { ana, ben, tripId, stops } = await crew();
    await ben.mutation(api.groupVotes.setPick, { activityId: stops[0]!._id, picked: true });
    await ben.mutation(api.members.leave, { tripId });
    expect((await ana.query(api.groupVotes.forTrip, { tripId }))!.voterCount).toBe(0);
  });
});
