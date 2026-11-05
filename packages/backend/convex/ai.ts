import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { getUserId } from "./lib/auth";
import { classifyRequest, MAX_TOKENS, modelsFor, nextTier, supportsServerFallback, type Tier, type Via } from "./lib/modelRouter";
import { type GeneratedTrip, generatedTripSchema, toTripTree } from "./lib/tripSchema";

type Generated = { trip: GeneratedTrip | null; truncated: boolean; refused: boolean; model: string };

/**
 * How requests reach a model:
 * - AI_GATEWAY_API_KEY set: the Vercel AI SDK through the AI Gateway, so any
 *   provider's model can serve a tier (Google, OpenAI, Anthropic, ...), with the
 *   gateway falling back through the tier's list.
 * - Only ANTHROPIC_API_KEY set: the Anthropic SDK straight to the Claude API.
 */
export const aiVia = (env: Record<string, string | undefined> = process.env): Via | null =>
  env.AI_GATEWAY_API_KEY ? "gateway" : env.ANTHROPIC_API_KEY ? "anthropic" : null;

async function generateViaGateway(models: string[], tier: Tier, content: string): Promise<Generated> {
  const [primary, ...fallbacks] = models;
  const result = await generateText({
    model: primary!,
    system: SYSTEM_PROMPT,
    prompt: content,
    output: Output.object({ schema: generatedTripSchema }),
    maxOutputTokens: MAX_TOKENS[tier],
    providerOptions: fallbacks.length ? { gateway: { models: fallbacks } } : undefined,
  }).catch((error: unknown) => {
    // A reply that doesn't match the schema (often a cut-off one) is retried a tier up.
    if (NoObjectGeneratedError.isInstance(error)) return null;
    throw error;
  });
  if (!result) return { trip: null, truncated: false, refused: false, model: primary! };
  let trip: GeneratedTrip | null = null;
  try {
    trip = result.output;
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

async function generateViaAnthropic(model: string, tier: Tier, content: string): Promise<Generated> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.parse({
    model,
    max_tokens: MAX_TOKENS[tier],
    // Opus/Sonnet only: re-runs a declined request on a fallback model.
    ...(supportsServerFallback("anthropic", model)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
    output_config: { effort: "medium", format: betaZodOutputFormat(generatedTripSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });
  return {
    trip: response.parsed_output ?? null,
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
          ? await generateViaGateway(models, tier, content)
          : await generateViaAnthropic(models[0]!, tier, content);

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
