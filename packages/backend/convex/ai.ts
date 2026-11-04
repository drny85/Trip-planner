import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { getUserId } from "./lib/auth";
import { generatedTripSchema, toTripTree } from "./lib/tripSchema";

const GATEWAY_URL = "https://ai-gateway.vercel.sh";

/**
 * Picks how to reach Claude. With AI_GATEWAY_API_KEY set, requests go through the
 * Vercel AI Gateway (its Anthropic-compatible Messages API, gateway model ids like
 * "anthropic/claude-opus-5.5"). Otherwise they go straight to the Anthropic API.
 * AI_MODEL overrides the model id in either mode.
 */
export function aiConfig(env: Record<string, string | undefined> = process.env) {
  if (env.AI_GATEWAY_API_KEY) {
    return {
      via: "gateway" as const,
      client: new Anthropic({ apiKey: env.AI_GATEWAY_API_KEY, baseURL: GATEWAY_URL }),
      model: env.AI_MODEL ?? "anthropic/claude-opus-5.5",
    };
  }
  if (env.ANTHROPIC_API_KEY) {
    return {
      via: "anthropic" as const,
      client: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
      model: env.AI_MODEL ?? "claude-opus-5-5",
    };
  }
  return null;
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
 * Needs one of these on the Convex deployment:
 *   npx convex env set AI_GATEWAY_API_KEY ...   (Vercel AI Gateway)
 *   npx convex env set ANTHROPIC_API_KEY sk-ant-...   (Anthropic API directly)
 */
export const generateTrip = action({
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }): Promise<Id<"trips">> => {
    const userId = await getUserId(ctx);
    const request = prompt.trim();
    if (request.length < 3) throw new Error("Describe the trip you want");
    if (request.length > 2000) throw new Error("Keep the trip description under 2000 characters");
    const ai = aiConfig();
    if (!ai) {
      throw new Error("AI is not set up: add AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY to the Convex deployment");
    }

    const today = new Date().toISOString().slice(0, 10);

    const response = await ai.client.beta.messages.parse({
      model: ai.model,
      max_tokens: 16000,
      // Direct API only: re-runs the request on a fallback model if the primary declines it.
      // The gateway has its own provider failover, so this beta isn't sent there.
      ...(ai.via === "anthropic" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      output_config: { effort: "medium", format: betaZodOutputFormat(generatedTripSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Today is ${today}.\n\nTrip request: ${request}` }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("The trip planner couldn't help with that request. Try rephrasing it.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("That trip is too long to generate in one go. Try fewer days.");
    }
    const trip = response.parsed_output;
    if (!trip || trip.subTrips.length === 0) {
      throw new Error("The generated itinerary was incomplete. Please try again.");
    }

    return ctx.runMutation(internal.trips.saveGenerated, {
      userId,
      prompt: request,
      tree: toTripTree(trip),
    });
  },
});
