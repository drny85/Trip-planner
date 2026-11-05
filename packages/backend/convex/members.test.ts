/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { decide } from "./lib/majority";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const idea = { title: "Ramen at Ichiran", description: "", address: "Shibuya", photoUrl: "https://picsum.photos/seed/r/800/600", category: "food" as const, subcategory: "dinner" };

/** Owner Ana with a trip, plus Ben and Cy who joined through the invite link. */
async function crew(extra = 2) {
  const t = convexTest(schema, modules);
  const ana = t.withIdentity({ subject: "ana", name: "Ana" });
  const tripId = await ana.mutation(api.seed.demoTrip, {});
  const token = await ana.mutation(api.members.createInvite, { tripId });
  const others = ["Ben", "Cy", "Dee"].slice(0, extra).map((name) => t.withIdentity({ subject: name.toLowerCase(), name }));
  for (const o of others) await o.mutation(api.members.join, { token });
  const trip = (await ana.query(api.trips.get, { tripId }))!;
  return { t, ana, others, tripId, token, day: trip.subTrips[0]! };
}

describe("majority", () => {
  test("needs more than half, and gives up once that's impossible", () => {
    expect(decide({ yes: 1, no: 0, members: 1 })).toBe("accepted");
    expect(decide({ yes: 1, no: 0, members: 2 })).toBe("open");
    expect(decide({ yes: 1, no: 1, members: 2 })).toBe("rejected");
    expect(decide({ yes: 2, no: 0, members: 3 })).toBe("accepted");
    expect(decide({ yes: 1, no: 1, members: 3 })).toBe("open");
    expect(decide({ yes: 1, no: 2, members: 3 })).toBe("rejected");
    expect(decide({ yes: 2, no: 2, members: 4 })).toBe("rejected");
  });
});

describe("members", () => {
  test("invite link lets friends join and see the trip; strangers can't", async () => {
    const { t, ana, others, tripId, token } = await crew();
    const preview = await t.query(api.members.invitePreview, { token });
    expect(preview).toMatchObject({ title: "Tokyo Adventure", ownerName: "Ana", memberNames: ["Ana", "Ben", "Cy"] });

    const ben = others[0]!;
    const asBen = await ben.query(api.trips.get, { tripId });
    expect(asBen?.myRole).toBe("member");
    expect(asBen?.shareToken).toBeUndefined();
    expect((await ben.query(api.trips.list, {})).map((x) => [x.title, x.isOwner])).toEqual([["Tokyo Adventure", false]]);

    const stranger = t.withIdentity({ subject: "zed", name: "Zed" });
    expect(await stranger.query(api.trips.get, { tripId })).toBeNull();
    expect(await stranger.query(api.suggestions.forTrip, { tripId })).toBeNull();

    // Members can check things off but not rearrange the itinerary.
    const first = asBen!.subTrips[0]!.activities[0]!;
    await ben.mutation(api.activities.setCompleted, { activityId: first._id, isCompleted: true });
    await expect(ben.mutation(api.activities.remove, { activityId: first._id })).rejects.toThrow();

    // Revoking the link stops new joins.
    await ana.mutation(api.members.revokeInvite, { tripId });
    await expect(stranger.mutation(api.members.join, { token })).rejects.toThrow(/isn't active/);
    expect((await ana.query(api.members.forTrip, { tripId }))?.members.map((m) => m.name)).toEqual(["Ana", "Ben", "Cy"]);
  });

  test("share links never expose the invite token", async () => {
    const { ana, t, tripId } = await crew(0);
    const shareToken = await ana.mutation(api.trips.share, { tripId });
    const shared = await t.query(api.trips.getShared, { token: shareToken });
    expect(shared && "inviteToken" in shared).toBe(false);
  });
});

describe("suggestions", () => {
  test("an idea becomes an activity once a majority votes yes", async () => {
    const { ana, others, tripId, day } = await crew();
    const [ben, cy] = others as [typeof ana, typeof ana];
    const id = await ben.mutation(api.suggestions.create, { subTripId: day._id, ...idea });

    let list = (await cy.query(api.suggestions.forTrip, { tripId }))!;
    expect(list.open[0]).toMatchObject({ title: "Ramen at Ichiran", authorName: "Ben", tally: { yes: 1, no: 0, members: 3 }, yesNeeded: 1 });

    expect(await cy.mutation(api.suggestions.vote, { suggestionId: id, value: "yes" })).toBe("accepted");
    list = (await ana.query(api.suggestions.forTrip, { tripId }))!;
    expect(list.open).toHaveLength(0);
    expect(list.decided[0]?.status).toBe("accepted");
    const activities = (await ana.query(api.trips.get, { tripId }))!.subTrips[0]!.activities;
    expect(activities.at(-1)).toMatchObject({ title: "Ramen at Ichiran", subcategory: "dinner", order: activities.length - 1 });
    await expect(ana.mutation(api.suggestions.vote, { suggestionId: id, value: "no" })).rejects.toThrow(/closed/);
  });

  test("an idea is dropped once a majority is out of reach; changing a vote counts", async () => {
    const { ana, others, tripId, day } = await crew(3); // 4 people: 3 yes needed
    const [ben, cy] = others as [typeof ana, typeof ana];
    const id = await ben.mutation(api.suggestions.create, { subTripId: day._id, ...idea });
    expect(await cy.mutation(api.suggestions.vote, { suggestionId: id, value: "no" })).toBe("open");
    expect(await cy.mutation(api.suggestions.vote, { suggestionId: id, value: "yes" })).toBe("open");
    expect(await ana.mutation(api.suggestions.vote, { suggestionId: id, value: "no" })).toBe("open");
    expect(await cy.mutation(api.suggestions.vote, { suggestionId: id, value: "no" })).toBe("rejected");
    const before = (await ana.query(api.trips.get, { tripId }))!.subTrips[0]!.activities.length;
    expect(before).toBe(4);
  });

  test("when someone leaves, open ideas are re-checked against the smaller group", async () => {
    const { ana, others, tripId, day } = await crew(); // 3 people
    const [ben, cy] = others as [typeof ana, typeof ana];
    const id = await ana.mutation(api.suggestions.create, { subTripId: day._id, ...idea });
    await ben.mutation(api.suggestions.vote, { suggestionId: id, value: "no" });
    // Ana yes, Ben no, Cy undecided. Ben leaves: 1 yes of 2 is still not a majority...
    await ben.mutation(api.members.leave, { tripId });
    expect((await ana.query(api.suggestions.forTrip, { tripId }))!.open[0]?.tally).toEqual({ yes: 1, no: 0, members: 2 });
    // ...until the owner removes Cy too, and 1 of 1 passes.
    await ana.mutation(api.members.remove, { tripId, userId: "cy" });
    expect((await ana.query(api.suggestions.forTrip, { tripId }))!.decided[0]?.status).toBe("accepted");
    void cy;
  });

  test("only the author can withdraw", async () => {
    const { ana, others, tripId, day } = await crew();
    const id = await others[0]!.mutation(api.suggestions.create, { subTripId: day._id, ...idea });
    await expect(ana.mutation(api.suggestions.withdraw, { suggestionId: id })).rejects.toThrow(/Only the person/);
    await others[0]!.mutation(api.suggestions.withdraw, { suggestionId: id });
    expect((await ana.query(api.suggestions.forTrip, { tripId }))!.open).toHaveLength(0);
  });
});
