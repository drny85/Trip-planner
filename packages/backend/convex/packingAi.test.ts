/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { generateText } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateText: vi.fn<(opts: any) => Promise<any>>(),
}));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText }));
import { api } from "./_generated/api";
import { cleanItems, itemKey, MAX_RUNS_PER_DAY, packingContent, summarizeWeather, weatherRequest, type GeneratedPacking } from "./lib/packingAi";
import { groupPacking } from "./lib/packingCategories";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const aiList: GeneratedPacking = {
  items: [
    { text: "Hiking shoes", category: "footwear", reason: "Mt. Takao hike on day 3", group: false },
    { text: "Type A plug adapter", category: "Electronics", reason: "Japan uses Type A sockets", group: true },
    { text: "Socks", category: "clothing", quantity: 5.4, reason: "5 days", group: false },
    { text: "passport", category: "documents", reason: "Entry to Japan", group: false },
    { text: "Compact umbrella", category: "weatherproof", reason: "Rain on 2 days", group: false },
  ],
};

describe("packing helpers", () => {
  test("cleanItems normalizes categories and quantities and drops what's already there", () => {
    const items = cleanItems(aiList.items, ["Passport"]);
    expect(items.map((i) => i.text)).toEqual(["Hiking shoes", "Type A plug adapter", "Socks", "Compact umbrella"]);
    expect(items[1]).toMatchObject({ category: "electronics", isGroupItem: true });
    expect(items[2]).toMatchObject({ quantity: 5 });
    expect(items[3]!.category).toBe("other");
    expect(items[0]!.quantity).toBeUndefined();
    expect(itemKey("Sun-screen ")).toBe(itemKey("sunscreen"));
  });

  test("near trips use the forecast and far trips use last year's same dates", () => {
    const near = weatherRequest(35.68, 139.76, "2026-11-10", "2026-11-14", "2026-11-05")!;
    expect(near.source).toBe("forecast");
    expect(near.url).toContain("api.open-meteo.com/v1/forecast");
    expect(near.url).toContain("start_date=2026-11-10");
    const far = weatherRequest(35.68, 139.76, "2027-04-01", "2027-04-05", "2026-11-05")!;
    expect(far.source).toBe("lastYear");
    expect(far.url).toContain("archive-api.open-meteo.com");
    expect(far.url).toContain("start_date=2026-04-01");
    expect(far.url).toContain("end_date=2026-04-05");
    expect(weatherRequest(0, 0, "2026-10-01", "2026-10-03", "2026-11-05")).toBeNull();
  });

  test("summarizeWeather counts rainy and snowy days", () => {
    const forecast = summarizeWeather(
      { daily: { weather_code: [0, 61, 3, 73], temperature_2m_max: [21.4, 18, 19, 2], temperature_2m_min: [12, 10.6, 9, -3.4], precipitation_probability_max: [5, 80, 60, 30] } },
      "forecast",
    );
    expect(forecast).toEqual({ source: "forecast", days: 4, high: 21, low: -3, rainyDays: 2, snowyDays: 1 });
    const archive = summarizeWeather({ daily: { weather_code: [1, 2], temperature_2m_max: [30, 31], temperature_2m_min: [22, 23], precipitation_sum: [0, 4.2], snowfall_sum: [0, 0] } }, "lastYear");
    expect(archive).toMatchObject({ rainyDays: 1, snowyDays: 0 });
    expect(summarizeWeather({}, "forecast")).toBeNull();
  });
});

describe("ai.generatePackingList", () => {
  let weatherCalls: string[] = [];
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
    for (const name of ["AI_MODEL", "AI_MODEL_SIMPLE", "AI_MODEL_STANDARD", "AI_MODEL_COMPLEX"]) vi.stubEnv(name, "");
    weatherCalls = [];
    // The demo trip is in April 2027: far enough out to use last year's weather.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T12:00:00Z") });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        weatherCalls.push(String(input));
        return Response.json({ daily: { weather_code: [61, 2], temperature_2m_max: [16, 18], temperature_2m_min: [8, 9], precipitation_sum: [6, 0], snowfall_sum: [0, 0], precipitation_probability_max: [90, 10] } });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    generateText.mockReset();
  });

  async function tripWithFriend() {
    const t = convexTest(schema, modules);
    const ana = t.withIdentity({ subject: "ana", name: "Ana" });
    const tripId = await ana.mutation(api.seed.demoTrip, {});
    const token = await ana.mutation(api.members.createInvite, { tripId });
    const ben = t.withIdentity({ subject: "ben", name: "Ben" });
    await ben.mutation(api.members.join, { token });
    return { t, ana, ben, tripId };
  }

  test("packs from the weather and the plan, and the whole group sees it", async () => {
    const { ana, ben, tripId } = await tripWithFriend();
    await ana.mutation(api.packing.add, { tripId, text: "Passport" });
    generateText.mockResolvedValueOnce({ output: aiList, finishReason: "stop", response: { modelId: "google/gemini-3.5-flash" } });

    const result = await ben.action(api.ai.generatePackingList, { tripId, language: "es" });
    expect(result).toMatchObject({ added: 4, model: "google/gemini-3.5-flash", weather: { rainyDays: 1, high: 18, low: 8 } });
    expect(weatherCalls.find((u) => u.includes("open-meteo.com"))).toContain("archive-api.open-meteo.com");

    const call = generateText.mock.calls[0]![0];
    expect(call.model).toBe("google/gemini-3.5-flash");
    expect(call.system).toContain("Spanish");
    expect(call.prompt).toContain("Travelers: 2.");
    expect(call.prompt).toContain("rain on 1 day(s)");
    expect(call.prompt).toContain("Already on the list: Passport");
    expect(call.prompt).toMatch(/Day 1 .*Senso/);

    const list = (await ana.query(api.packing.list, { tripId }))!;
    expect(list).toHaveLength(5);
    expect(list.find((i) => i.text === "Type A plug adapter")).toMatchObject({ isAi: true, category: "electronics", isGroupItem: true, reason: "Japan uses Type A sockets" });
    expect(await ana.query(api.packing.lastRun, { tripId })).toMatchObject({ added: 4, weather: { rainyDays: 1 } });
    // Anyone on the trip ticks things off.
    await ana.mutation(api.packing.toggle, { itemId: list[1]!._id, isPacked: true });
    expect((await ben.query(api.packing.list, { tripId }))![1]!.isPacked).toBe(true);
  });

  test("a bad reply goes a tier up; strangers and the daily limit are refused", async () => {
    const { t, ana, tripId } = await tripWithFriend();
    generateText
      .mockResolvedValueOnce({ output: aiList, finishReason: "length", response: { modelId: "google/gemini-3.5-flash" } })
      .mockResolvedValueOnce({ output: aiList, finishReason: "stop", response: { modelId: "anthropic/claude-sonnet-5.5" } });
    expect((await ana.action(api.ai.generatePackingList, { tripId })).model).toBe("anthropic/claude-sonnet-5.5");

    const eve = t.withIdentity({ subject: "eve", name: "Eve" });
    await expect(eve.action(api.ai.generatePackingList, { tripId })).rejects.toThrow("Trip not found");

    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_RUNS_PER_DAY; i++) await ctx.db.insert("packingRuns", { tripId, userId: "ana", model: "x", added: 0 });
    });
    await expect(ana.action(api.ai.generatePackingList, { tripId, language: "de" })).rejects.toThrow("Packlisten");
  });

  test("the prompt lists every day's plan", () => {
    const text = packingContent(
      { tripTitle: "T", destination: "Oslo", startDate: "2027-01-01", endDate: "2027-01-02", travelers: 1, existing: [], days: [{ dayNumber: 1, activities: [{ title: "Ski", category: "nature", subcategory: "hike" }] }] },
      null,
    );
    expect(text).toContain("Day 1: Ski [nature/hike]");
    expect(text).toContain("Weather: unknown");
  });
});

test("groupPacking orders sections and puts packed items last", () => {
  const sections = groupPacking([
    { text: "a", category: "gear" as const, isPacked: true },
    { text: "b", isPacked: false },
    { text: "c", category: "documents" as const, isPacked: false },
    { text: "d", category: "gear" as const, isPacked: false },
  ]);
  expect(sections.map((s) => s.key)).toEqual(["documents", "gear", "none"]);
  expect(sections[1]!.items.map((i) => i.text)).toEqual(["d", "a"]);
});
