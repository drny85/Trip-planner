/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// The gateway path goes through the Vercel AI SDK; stub its generateText.
const { generateText } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateText: vi.fn<(opts: any) => Promise<any>>(),
}));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText }));
import { api } from "./_generated/api";
import type { GeneratedTrip } from "./lib/tripSchema";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const fakeTrip: GeneratedTrip = {
  title: "Lisbon Long Weekend",
  destination: "Lisbon, Portugal",
  description: "Trams, tiles and pastéis de nata.",
  startDate: "2027-05-07",
  endDate: "2027-05-08",
  currency: "EUR",
  subTrips: [
    {
      title: "Day 1 · Alfama",
      dayNumber: 1,
      date: "2027-05-07",
      location: "Lisbon",
      activities: [
        {
          title: "Ride Tram 28",
          description: "The classic yellow tram through Alfama.",
          address: "Praça Martim Moniz, 1100-341 Lisboa",
          category: "Transport",
          startTime: "09:00",
          durationMinutes: 45.4,
          bookingUrl: "javascript:alert(1)",
        },
        {
          title: "Lunch at Time Out Market",
          description: "Food hall with Lisbon's best chefs.",
          address: "Av. 24 de Julho 49, 1200-479 Lisboa",
          category: "food",
          startTime: "12:30",
          durationMinutes: 75,
          websiteUrl: "https://www.timeoutmarket.com/lisboa/",
        },
      ],
    },
    {
      title: "Day 2 · Belém",
      dayNumber: 2,
      date: "2027-05-08",
      location: "Lisbon",
      activities: [
        {
          title: "Jerónimos Monastery",
          description: "Manueline masterpiece.",
          address: "Praça do Império 1400-206 Lisboa",
          category: "sightseeing",
          startTime: "10:00",
          durationMinutes: 90,
        },
      ],
    },
  ],
};

let requests: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
        headers: new Headers(init?.headers),
      });
      return new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [{ type: "text", text: JSON.stringify(fakeTrip) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  generateText.mockReset();
});

test("generateTrip calls Claude with a JSON schema and saves the tree", async () => {
  const t = convexTest(schema, modules);
  const tripId = await t.action(api.ai.generateTrip, { prompt: "2 days in Lisbon, moderate budget" });

  expect(requests).toHaveLength(1);
  const { body, headers } = requests[0]!;
  // A 2-day, one-city trip is routed to the cheap tier, which has no server-side fallback.
  expect(body.model).toBe("claude-haiku-5-5");
  expect(body).not.toHaveProperty("fallbacks");
  expect(body.output_config).toMatchObject({ format: { type: "json_schema" } });
  expect(headers.get("anthropic-beta") ?? "").not.toContain("server-side-fallback");

  const trip = await t.query(api.trips.get, { tripId });
  expect(trip).toMatchObject({ title: "Lisbon Long Weekend", isAIGenerated: true, prompt: "2 days in Lisbon, moderate budget" });
  expect(trip?.subTrips).toHaveLength(2);
  const [tram, lunch] = trip!.subTrips[0]!.activities;
  expect(tram).toMatchObject({ category: "transport", durationMinutes: 45, order: 0 });
  expect(tram?.bookingUrl).toBeUndefined();
  expect(tram?.photoUrl).toMatch(/^https:\/\/images\.unsplash\.com\/photo-/);
  expect(lunch).toMatchObject({ category: "food", websiteUrl: "https://www.timeoutmarket.com/lisboa/", order: 1 });
});

test("through the gateway, a weekend goes to the cheap tier with cross-provider fallbacks", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
  generateText.mockResolvedValueOnce({ output: fakeTrip, finishReason: "stop", response: { modelId: "google/gemini-3.5-flash" } });

  const t = convexTest(schema, modules);
  const tripId = await t.action(api.ai.generateTrip, { prompt: "A weekend in Lisbon" });

  expect(requests).toHaveLength(0); // nothing went to the Anthropic API
  expect(generateText).toHaveBeenCalledTimes(1);
  const call = generateText.mock.calls[0]![0];
  expect(call.model).toBe("google/gemini-3.5-flash");
  expect(call.providerOptions).toEqual({ gateway: { models: ["anthropic/claude-haiku-5.5"] } });
  expect(await t.query(api.trips.get, { tripId })).toMatchObject({ title: "Lisbon Long Weekend", aiModel: "google/gemini-3.5-flash" });
});

test("through the gateway, a cut-off answer is retried one tier up", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
  generateText
    .mockResolvedValueOnce({ output: fakeTrip, finishReason: "length", response: { modelId: "google/gemini-3.5-flash" } })
    .mockResolvedValueOnce({ output: fakeTrip, finishReason: "stop", response: { modelId: "anthropic/claude-sonnet-5.5" } });

  const t = convexTest(schema, modules);
  const tripId = await t.action(api.ai.generateTrip, { prompt: "2 days in Lisbon" });

  expect(generateText.mock.calls.map((c) => c[0].model)).toEqual(["google/gemini-3.5-flash", "anthropic/claude-sonnet-5.5"]);
  expect((await t.query(api.trips.get, { tripId }))?.aiModel).toBe("anthropic/claude-sonnet-5.5");
});

test("per-tier env overrides pick any provider's models", async () => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
  vi.stubEnv("AI_MODEL_COMPLEX", "openai/gpt-5.5, google/gemini-3.5-flash");
  generateText.mockResolvedValueOnce({ output: fakeTrip, finishReason: "stop", response: { modelId: "openai/gpt-5.5" } });

  const t = convexTest(schema, modules);
  await t.action(api.ai.generateTrip, { prompt: "Two weeks backpacking Rome, Florence and Venice" });
  const call = generateText.mock.calls[0]![0];
  expect(call.model).toBe("openai/gpt-5.5");
  expect(call.providerOptions).toEqual({ gateway: { models: ["google/gemini-3.5-flash"] } });
});

test("generateTrip explains what to set when no AI key is configured", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  const t = convexTest(schema, modules);
  await expect(t.action(api.ai.generateTrip, { prompt: "2 days in Lisbon" })).rejects.toThrow("AI_GATEWAY_API_KEY");
  expect(requests).toHaveLength(0);
});

test("directly against Claude, a long multi-city trip goes to Opus with the refusal fallback", async () => {
  const t = convexTest(schema, modules);
  await t.action(api.ai.generateTrip, { prompt: "10 days: Tokyo, then Kyoto and Osaka" });
  const { body, headers } = requests[0]!;
  expect(body.model).toBe("claude-opus-5-5");
  expect(body.fallbacks).toBe("default");
  expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
});

test("generateTrip rejects an empty prompt without calling the API", async () => {
  const t = convexTest(schema, modules);
  await expect(t.action(api.ai.generateTrip, { prompt: " " })).rejects.toThrow("Describe the trip");
  expect(requests).toHaveLength(0);
});
