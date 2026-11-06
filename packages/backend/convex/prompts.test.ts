/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { generateText } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateText: vi.fn<(opts: any) => Promise<any>>(),
}));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText }));
import { api } from "./_generated/api";
import { appendAnswer, withTimeout } from "./lib/promptAnswer";
import { IMPROVE_LIMIT_PER_HOUR, type PromptBrief, toImproveResult } from "./lib/promptBrief";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const brief: PromptBrief = {
  improved: "Trip to Tokyo for 5 days.\nInterests: food and temples.",
  brief: { destinations: ["Tokyo"], dates: null, length: "5 days", travelers: null, budget: null, pace: null, interests: ["food", "temples"], mustDo: [], avoid: [] },
  questions: [
    { topic: "travelers", question: "How many travelers?", options: [{ label: "Solo", addition: "I'm traveling solo." }, { label: "Couple", addition: "We are a couple." }] },
    { topic: "Budget", question: "Budget?", options: [{ label: "Budget", addition: "On a tight budget." }, { label: "Moderate", addition: "On a moderate budget." }] },
    // Duplicate topic and a question with one option are dropped.
    { topic: "travelers", question: "Who's going?", options: [{ label: "Family", addition: "Family trip." }, { label: "Friends", addition: "With friends." }] },
    { topic: "pace", question: "Pace?", options: [{ label: "Relaxed", addition: "Relaxed pace." }] },
  ],
};

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
  for (const name of ["AI_MODEL", "AI_MODEL_SIMPLE", "AI_MODEL_STANDARD", "AI_MODEL_COMPLEX"]) vi.stubEnv(name, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  generateText.mockReset();
});

test("improvePrompt uses the cheap tier and returns the rewrite with cleaned-up questions", async () => {
  generateText.mockResolvedValueOnce({ output: brief, finishReason: "stop", response: { modelId: "google/gemini-3.5-flash" } });
  const t = convexTest(schema, modules);
  const result = await t.action(api.ai.improvePrompt, { prompt: "tokyo 5 days food temples", language: "en" });

  const call = generateText.mock.calls[0]![0];
  expect(call.model).toBe("google/gemini-3.5-flash");
  expect(call.system).toContain("NEVER invent");
  expect(call.prompt).toContain("tokyo 5 days food temples");
  expect(result).toMatchObject({ ok: true, improved: brief.improved, model: "google/gemini-3.5-flash" });
  if (!result.ok) throw new Error("expected ok");
  expect(result.questions.map((q) => q.topic)).toEqual(["travelers", "budget"]);
});

test("improvePrompt falls back quietly when the model fails or AI isn't set up", async () => {
  const t = convexTest(schema, modules);
  generateText.mockRejectedValueOnce(new Error("gateway down"));
  expect(await t.action(api.ai.improvePrompt, { prompt: "Lisbon weekend" })).toEqual({ ok: false, reason: "unavailable" });

  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  expect(await t.action(api.ai.improvePrompt, { prompt: "Lisbon weekend" })).toEqual({ ok: false, reason: "unavailable" });
});

test("improvePrompt is limited per hour, and never creates a trip", async () => {
  generateText.mockResolvedValue({ output: brief, finishReason: "stop", response: { modelId: "m" } });
  const t = convexTest(schema, modules);
  for (let i = 0; i < IMPROVE_LIMIT_PER_HOUR; i++) {
    expect((await t.action(api.ai.improvePrompt, { prompt: "Rome trip" })).ok).toBe(true);
  }
  expect(await t.action(api.ai.improvePrompt, { prompt: "Rome trip" })).toEqual({ ok: false, reason: "limit" });
  expect(generateText).toHaveBeenCalledTimes(IMPROVE_LIMIT_PER_HOUR);
  expect(await t.run((ctx) => ctx.db.query("trips").collect())).toHaveLength(0);
});

test("a rewrite with placeholders is rejected", () => {
  expect(toImproveResult({ ...brief, improved: "Tokyo for [number] days" }, "tokyo", "m")).toBeNull();
});

test("appendAnswer adds a sentence, and withTimeout gives up", async () => {
  expect(appendAnswer("5 days in Tokyo", "We are a couple.")).toBe("5 days in Tokyo. We are a couple.");
  expect(appendAnswer("5 days in Tokyo.\n", "We are a couple.")).toBe("5 days in Tokyo. We are a couple.");
  expect(appendAnswer("", "Solo.")).toBe("Solo.");
  expect(appendAnswer("5 days in Tokyo.\nInterests: food.", "We are a couple.")).toBe("5 days in Tokyo.\nInterests: food.\nWe are a couple.");
  expect(await withTimeout(new Promise(() => {}), 10)).toBeNull();
  expect(await withTimeout(Promise.reject(new Error("x")), 10)).toBeNull();
  expect(await withTimeout(Promise.resolve(1), 10)).toBe(1);
});
