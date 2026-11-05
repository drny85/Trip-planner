/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { generateText } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateText: vi.fn<(opts: any) => Promise<any>>(),
}));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText }));
import { api } from "./_generated/api";
import { toLocalPickArgs } from "./lib/localPick";
import { toCrowd, toTips } from "./lib/tripSchema";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  for (const name of ["ANTHROPIC_API_KEY", "AI_MODEL", "AI_MODEL_SIMPLE", "AI_MODEL_STANDARD", "AI_MODEL_COMPLEX"]) vi.stubEnv(name, "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  generateText.mockReset();
});

async function demoDay() {
  const t = convexTest(schema, modules);
  const ana = t.withIdentity({ subject: "ana", name: "Ana" });
  const tripId = await ana.mutation(api.seed.demoTrip, {});
  const day = (await ana.query(api.trips.get, { tripId }))!.subTrips[0]!;
  return { t, ana, tripId, day };
}

test("tips and crowd forecasts from the model are cleaned up", () => {
  expect(
    toTips([
      { kind: "Time", text: "Go before 9 &amp; skip the queue" },
      { kind: "bogus", text: "dropped" },
      { kind: "order", text: "" },
      { kind: "free", text: "Free on the first Sunday" },
      { kind: "insider", text: "Side gate is quieter" },
      { kind: "avoid", text: "a fourth one is cut" },
    ]),
  ).toEqual([
    { kind: "time", text: "Go before 9 & skip the queue" },
    { kind: "free", text: "Free on the first Sunday" },
    { kind: "insider", text: "Side gate is quieter" },
  ]);
  expect(toCrowd({ level: "Busy", peakFrom: "11:00", peakTo: "9:00", bestTime: "8:30" })).toEqual({ level: "busy", bestTime: "08:30" });
  expect(toCrowd({ level: "heaving" })).toBeUndefined();
});

test("local's pick swaps stops, keeps locked ones, and can be undone", async () => {
  const { t, ana, tripId, day } = await demoDay();
  const [first, second, third] = day.activities;
  // Done stops are locked: never swapped out.
  await ana.mutation(api.activities.setCompleted, { activityId: third!._id, isCompleted: true });

  generateText.mockResolvedValueOnce({
    output: {
      summary: "Swapped the big temple for a quiet local one.",
      activities: [
        {
          title: "Imado Shrine",
          description: "A small shrine locals visit for luck.",
          address: "1-5-22 Imado, Taito City, Tokyo",
          category: "sightseeing",
          startTime: "08:30",
          durationMinutes: 45,
          replaces: first!.title,
          localTips: [{ kind: "insider", text: "Look for the beckoning-cat charms." }],
          crowd: { level: "quiet", bestTime: "08:00" },
        },
        { keepId: second!._id, title: second!.title, description: "", address: "", category: "food", startTime: "11:45", durationMinutes: 60, localTips: [{ kind: "order", text: "Get the tendon." }], crowd: { level: "busy", peakFrom: "11:30", peakTo: "13:30", bestTime: "11:00" } },
      ],
    },
    finishReason: "stop",
    response: { modelId: "anthropic/claude-sonnet-5.5" },
  });
  const proposal = await ana.action(api.ai.localPickDay, { subTripId: day._id, language: "en" });
  expect(proposal.activities[0]).toMatchObject({ isNew: true, isLocalPick: true, replaces: first!.title, crowd: { level: "quiet", bestTime: "08:00" } });
  // The done stop the model left out comes back anyway.
  expect(proposal.activities.map((a: { title: string }) => a.title)).toEqual(["Imado Shrine", second!.title, third!.title]);

  await ana.mutation(api.localPicks.apply, { subTripId: day._id, activities: toLocalPickArgs(proposal) });
  let after = (await ana.query(api.trips.get, { tripId }))!.subTrips[0]!;
  expect(after.localPickAt).toBeTypeOf("number");
  expect(after.activities.map((a) => a.title)).toContain("Imado Shrine");
  expect(after.activities.map((a) => a.title)).not.toContain(first!.title);
  expect(after.activities.find((a) => a._id === second!._id)).toMatchObject({ startTime: "11:45", localTips: [{ kind: "order", text: "Get the tendon." }] });
  expect(after.activities.find((a) => a._id === third!._id)?.isCompleted).toBe(true);

  // Only the organizer can switch it.
  const ben = t.withIdentity({ subject: "ben", name: "Ben" });
  await expect(ben.mutation(api.localPicks.restore, { subTripId: day._id })).rejects.toThrow();

  await ana.mutation(api.localPicks.restore, { subTripId: day._id });
  after = (await ana.query(api.trips.get, { tripId }))!.subTrips[0]!;
  expect(after.localPickAt).toBeUndefined();
  const titles = after.activities.map((a) => a.title);
  expect(titles).toContain(first!.title);
  expect(titles).not.toContain("Imado Shrine");
  expect(after.activities.map((a) => a.order)).toEqual(after.activities.map((_, i) => i));
  // In time order again.
  const times = after.activities.map((a) => a.startTime ?? "99:99");
  expect(times).toEqual([...times].sort());
});

test("addLocalTips fills tips on the existing plan without changing it", async () => {
  const { ana, tripId, day } = await demoDay();
  const [first, second] = day.activities;
  generateText.mockResolvedValueOnce({
    output: {
      activities: [
        { id: first!._id, localTips: [{ kind: "time", text: "Arrive before 8 for an empty gate." }], crowd: { level: "packed", peakFrom: "10:00", peakTo: "15:00", bestTime: "07:30" } },
        { id: second!._id, localTips: [{ kind: "nonsense", text: "x" }] },
        { id: "not-a-real-id", localTips: [{ kind: "time", text: "ignored" }] },
      ],
    },
    finishReason: "stop",
    response: { modelId: "google/gemini-3.5-flash" },
  });
  expect(await ana.action(api.ai.addLocalTips, { subTripId: day._id })).toBe(1);
  const after = (await ana.query(api.trips.get, { tripId }))!.subTrips[0]!;
  expect(after.activities.map((a) => a._id)).toEqual(day.activities.map((a) => a._id));
  expect(after.activities[0]).toMatchObject({ localTips: [{ kind: "time" }], crowd: { level: "packed", peakFrom: "10:00", peakTo: "15:00" } });
  // Nothing usable for the second stop: its own tips stay as they were.
  expect(after.activities[1]?.localTips).toEqual(second!.localTips);
});
