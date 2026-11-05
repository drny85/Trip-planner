import { describe, expect, test } from "vitest";
import { classifyRequest, estimateDays, modelsFor } from "./modelRouter";

describe("estimateDays", () => {
  test.each([
    ["5 days in Tokyo", 5],
    ["A week in Bali", 7],
    ["two weeks in Peru", 14],
    ["a long weekend in Lisbon", 3],
    ["weekend in Paris", 2],
    ["3-day trip to Rome", 3],
    ["10 nights in Thailand", 10],
    ["Somewhere warm in March", null],
  ])("%s → %s", (request, days) => expect(estimateDays(request)).toBe(days));
});

describe("classifyRequest", () => {
  test.each([
    ["A weekend in Lisbon with great seafood", "simple"],
    ["3 days in Rome, love pasta", "simple"],
    ["5 days in Tokyo on a moderate budget, love food and temples", "standard"],
    ["Somewhere warm with beaches", "standard"],
    ["Two weeks in Japan", "complex"],
    ["A week road-tripping the Amalfi Coast", "complex"],
    ["6 days: Rome, Florence and Venice", "complex"],
    ["4 days in Tokyo then Kyoto", "standard"],
  ])("%s → %s", (request, tier) => expect(classifyRequest(request).tier).toBe(tier));
});

describe("modelsFor", () => {
  test("gateway tiers mix providers", () => {
    const all = (["simple", "standard", "complex"] as const).flatMap((t) => modelsFor(t, "gateway", {}));
    const providers = new Set(all.map((m) => m.split("/")[0]));
    expect(providers).toEqual(new Set(["google", "anthropic", "openai"]));
  });
  test("AI_MODEL turns routing off; the direct API gets one model", () => {
    expect(modelsFor("simple", "gateway", { AI_MODEL: "openai/gpt-5.5" })).toEqual(["openai/gpt-5.5"]);
    expect(modelsFor("complex", "anthropic", { AI_MODEL_COMPLEX: "claude-sonnet-5-5,claude-opus-5-5" })).toEqual(["claude-sonnet-5-5"]);
  });
});
