import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { getUserId } from "./lib/auth";
import { classifyRequest, MAX_TOKENS, modelsFor, nextTier, supportsServerFallback, type Tier, type Via } from "./lib/modelRouter";
import type { z } from "zod";
import { type GeneratedTrip, generatedTripSchema, replanSchema, toNewActivity, toTripTree } from "./lib/tripSchema";

type Result<T> = { trip: T | null; truncated: boolean; refused: boolean; model: string };
type Generated = Result<GeneratedTrip>;
type Spec<S extends z.ZodType> = { system: string; schema: S };

/**
 * How requests reach a model:
 * - AI_GATEWAY_API_KEY set: the Vercel AI SDK through the AI Gateway, so any
 *   provider's model can serve a tier (Google, OpenAI, Anthropic, ...), with the
 *   gateway falling back through the tier's list.
 * - Only ANTHROPIC_API_KEY set: the Anthropic SDK straight to the Claude API.
 */
export const aiVia = (env: Record<string, string | undefined> = process.env): Via | null =>
  env.AI_GATEWAY_API_KEY ? "gateway" : env.ANTHROPIC_API_KEY ? "anthropic" : null;

export async function generateViaGateway<S extends z.ZodType>(models: string[], tier: Tier, content: string, spec: Spec<S>): Promise<Result<z.infer<S>>> {
  const [primary, ...fallbacks] = models;
  const result = await generateText({
    model: primary!,
    system: spec.system,
    prompt: content,
    output: Output.object({ schema: spec.schema }),
    maxOutputTokens: MAX_TOKENS[tier],
    providerOptions: fallbacks.length ? { gateway: { models: fallbacks } } : undefined,
  }).catch((error: unknown) => {
    // A reply that doesn't match the schema (often a cut-off one) is retried a tier up.
    if (NoObjectGeneratedError.isInstance(error)) return null;
    throw error;
  });
  if (!result) return { trip: null, truncated: false, refused: false, model: primary! };
  let trip: z.infer<S> | null = null;
  try {
    trip = result.output as z.infer<S>;
  } catch {
    // No parseable object (e.g. the reply was cut off): treated as incomplete.
  }
  return {
    trip,
    truncated: result.finishReason === "length",
    refused: result.finishReason === "content-filter",
    model: result.response.modelId || primary!,
  };
}

export async function generateViaAnthropic<S extends z.ZodType>(model: string, tier: Tier, content: string, spec: Spec<S>): Promise<Result<z.infer<S>>> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.parse({
    model,
    max_tokens: MAX_TOKENS[tier],
    // Opus/Sonnet only: re-runs a declined request on a fallback model.
    ...(supportsServerFallback("anthropic", model)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
    output_config: { effort: "medium", format: betaZodOutputFormat(spec.schema) },
    system: spec.system,
    messages: [{ role: "user", content }],
  });
  return {
    trip: (response.parsed_output as z.infer<S> | null) ?? null,
    truncated: response.stop_reason === "max_tokens",
    refused: response.stop_reason === "refusal",
    model: response.model || model,
  };
}

const SYSTEM_PROMPT = `You are an expert travel planner. Turn the traveller's request into a complete, realistic itinerary.

- Use real, currently operating places with accurate street addresses.
- Group activities by day (or by multi-day leg when the traveller changes city), in the order they'd be done, with sensible start times and travel time between them.
- Respect the budget, pace and interests in the request. Mix sights, food and downtime.
- Only include a phone number, booking URL or website when you are confident it is correct; leave them out otherwise.
- If the request has no dates, start the trip 30 days after today's date.`;

const TRIP_SPEC = { system: SYSTEM_PROMPT, schema: generatedTripSchema };

/**
 * Generates a full Trip -> SubTrip -> Activity tree from a free-text prompt
 * (e.g. "5 days in Tokyo on a moderate budget"), saves it, and returns the new trip id.
 *
 * The model is picked per request by lib/modelRouter.ts. Needs one of these on Convex:
 *   npx convex env set AI_GATEWAY_API_KEY ...         (Vercel AI Gateway, any provider)
 *   npx convex env set ANTHROPIC_API_KEY sk-ant-...   (Claude API directly)
 */
export const generateTrip = action({
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }): Promise<Id<"trips">> => {
    const userId = await getUserId(ctx);
    const request = prompt.trim();
    if (request.length < 3) throw new Error("Describe the trip you want");
    if (request.length > 2000) throw new Error("Keep the trip description under 2000 characters");
    const via = aiVia();
    if (!via) {
      throw new Error("AI is not set up: add AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY to the Convex deployment");
    }

    const today = new Date().toISOString().slice(0, 10);
    const content = `Today is ${today}.\n\nTrip request: ${request}`;

    // Start on the cheapest tier that fits the request; if its answer is cut off or
    // incomplete, retry once per tier upward instead of failing.
    let tier: Tier | null = classifyRequest(request).tier;
    let lastError = "The generated itinerary was incomplete. Please try again.";

    while (tier) {
      const models = modelsFor(tier, via);
      const result =
        via === "gateway"
          ? await generateViaGateway(models, tier, content, TRIP_SPEC)
          : await generateViaAnthropic(models[0]!, tier, content, TRIP_SPEC);

      if (result.refused) {
        throw new Error("The trip planner couldn't help with that request. Try rephrasing it.");
      }
      if (result.trip && !result.truncated && result.trip.subTrips.length > 0) {
        return ctx.runMutation(internal.trips.saveGenerated, {
          userId,
          prompt: request,
          model: result.model,
          tree: toTripTree(result.trip),
        });
      }
      if (result.truncated) lastError = "That trip is too long to generate in one go. Try fewer days.";
      tier = process.env.AI_MODEL ? null : nextTier(tier);
    }
    throw new Error(lastError);
  },
});

const REPLAN_PROMPT = `You are an expert travel planner adjusting one day of an existing itinerary.

- Keep the activities that still make sense (pass their keepId), and move their times if needed.
- Replace the ones that don't fit the new conditions with real, currently operating places nearby with accurate street addresses.
- When it's rainy or stormy, prefer indoor or covered places (museums, food halls, galleries, arcades, onsen, covered markets) and keep outdoor time short.
- Keep the day's pace: about the same number of stops, in a sensible order with travel time between them. Keep meals at normal times.
- Only include a phone number, booking URL or website when you are confident it is correct.`;

type ReplanDay = {
  tripTitle: string;
  destination: string;
  dayNumber: number;
  date?: string;
  location?: string;
  activities: { id: string; title: string; category: string; startTime?: string; durationMinutes?: number; address: string; description: string }[];
};
export type ReplanProposal = {
  summary: string;
  model: string;
  activities: (
    | { keepId: string; title: string; startTime: string; durationMinutes: number }
    | (ReturnType<typeof toNewActivity> & { isNew: true })
  )[];
};

const replanResult = v.object({
  summary: v.string(),
  model: v.string(),
  activities: v.array(v.any()),
});

/**
 * Re-plans one day for a reason such as rain, using the same model routing as
 * trip generation. Returns a proposal; nothing changes until the organizer applies it.
 */
export const replanDay = action({
  args: {
    subTripId: v.id("subTrips"),
    reason: v.string(),
    weather: v.optional(v.object({ label: v.string(), high: v.number(), low: v.number(), rainChance: v.number() })),
  },
  returns: replanResult,
  handler: async (ctx, { subTripId, reason, weather }): Promise<ReplanProposal> => {
    const userId = await getUserId(ctx);
    const day: ReplanDay | null = await ctx.runQuery(internal.activities.dayForReplan, { subTripId, userId });
    if (!day) throw new Error("Only the organizer can re-plan a day");
    const via = aiVia();
    if (!via) throw new Error("AI is not set up: add AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY to the Convex deployment");

    const forecast = weather ? `Forecast: ${weather.label}, ${weather.high}°/${weather.low}°C, ${weather.rainChance}% chance of rain.\n` : "";
    const content = `Trip: ${day.tripTitle} in ${day.destination}.\nDay ${day.dayNumber}${day.date ? ` (${day.date})` : ""}${day.location ? ` in ${day.location}` : ""}.\n${forecast}Why re-plan: ${reason.trim().slice(0, 300) || "Make the day better"}.\n\nCurrent plan (JSON):\n${JSON.stringify(day.activities)}`;

    let tier: Tier | null = "standard";
    while (tier) {
      const models = modelsFor(tier, via);
      const spec = { system: REPLAN_PROMPT, schema: replanSchema };
      const result = via === "gateway" ? await generateViaGateway(models, tier, content, spec) : await generateViaAnthropic(models[0]!, tier, content, spec);
      if (result.refused) throw new Error("The planner couldn't help with that. Try a different reason.");
      const plan = result.trip;
      if (plan && !result.truncated && plan.activities.length > 0) {
        const known = new Set(day.activities.map((a) => a.id));
        return {
          summary: plan.summary,
          model: result.model,
          activities: plan.activities.map(({ keepId, ...a }) =>
            keepId && known.has(keepId)
              ? { keepId, title: day.activities.find((x) => x.id === keepId)!.title, startTime: a.startTime, durationMinutes: Math.max(0, Math.round(a.durationMinutes)) }
              : { ...toNewActivity(a, day.destination), isNew: true as const },
          ),
        };
      }
      tier = process.env.AI_MODEL ? null : nextTier(tier);
    }
    throw new Error("The new plan came back incomplete. Please try again.");
  },
});
