import Anthropic from "@anthropic-ai/sdk";
import { defaultLocale, isLocale, languageInEnglish, translator, type Locale } from "@trip/i18n";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { getUserId } from "./lib/auth";
import { classifyRequest, MAX_TOKENS, modelsFor, nextTier, supportsServerFallback, type Tier, type Via } from "./lib/modelRouter";
import type { z } from "zod";
import { IMPROVE_SYSTEM_PROMPT, type ImproveResult, promptBriefSchema, toImproveResult } from "./lib/promptBrief";
import { type GeneratedTrip, generatedTripSchema, replanSchema, toNewActivity, toTripTree } from "./lib/tripSchema";

type Result<T> = { trip: T | null; truncated: boolean; refused: boolean; model: string };
type Generated = Result<GeneratedTrip>;
type Spec<S extends z.ZodType> = { system: string; schema: S };
/** A PDF or image sent along with the text, as base64. */
export type AiFile = { data: string; mediaType: string; filename?: string };

/**
 * How requests reach a model:
 * - AI_GATEWAY_API_KEY set: the Vercel AI SDK through the AI Gateway, so any
 *   provider's model can serve a tier (Google, OpenAI, Anthropic, ...), with the
 *   gateway falling back through the tier's list.
 * - Only ANTHROPIC_API_KEY set: the Anthropic SDK straight to the Claude API.
 */
export const aiVia = (env: Record<string, string | undefined> = process.env): Via | null =>
  env.AI_GATEWAY_API_KEY ? "gateway" : env.ANTHROPIC_API_KEY ? "anthropic" : null;

export async function generateViaGateway<S extends z.ZodType>(models: string[], tier: Tier, content: string, spec: Spec<S>, file?: AiFile): Promise<Result<z.infer<S>>> {
  const [primary, ...fallbacks] = models;
  const result = await generateText({
    model: primary!,
    system: spec.system,
    ...(file
      ? {
          messages: [
            {
              role: "user" as const,
              content: [
                { type: "file" as const, mediaType: file.mediaType, filename: file.filename, data: { type: "data" as const, data: file.data } },
                { type: "text" as const, text: content },
              ],
            },
          ],
        }
      : { prompt: content }),
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

/** The Claude API content block for a file: a document for PDFs, an image otherwise. */
const anthropicFileBlock = (file: AiFile) =>
  file.mediaType === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: file.data } }
    : {
        type: "image" as const,
        source: { type: "base64" as const, media_type: file.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: file.data },
      };

export async function generateViaAnthropic<S extends z.ZodType>(model: string, tier: Tier, content: string, spec: Spec<S>, file?: AiFile): Promise<Result<z.infer<S>>> {
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
    messages: [{ role: "user", content: file ? [anthropicFileBlock(file), { type: "text" as const, text: content }] : content }],
  });
  return {
    trip: (response.parsed_output as z.infer<S> | null) ?? null,
    truncated: response.stop_reason === "max_tokens",
    refused: response.stop_reason === "refusal",
    model: response.model || model,
  };
}

/**
 * One structured request on the given tier, through whichever path is configured.
 * Shared by trip generation, day re-plans and booking import.
 */
export const generateStructured = <S extends z.ZodType>(via: Via, tier: Tier, content: string, spec: Spec<S>, file?: AiFile) => {
  const models = modelsFor(tier, via);
  return via === "gateway" ? generateViaGateway(models, tier, content, spec, file) : generateViaAnthropic(models[0]!, tier, content, spec, file);
};

const SYSTEM_PROMPT = `You are an expert travel planner. Turn the traveller's request into a complete, realistic itinerary.

- Use real, currently operating places with accurate street addresses.
- Group activities by day (or by multi-day leg when the traveller changes city), in the order they'd be done, with sensible start times and travel time between them.
- Respect the budget, pace and interests in the request. Mix sights, food and downtime.
- Only include a phone number, booking URL or website when you are confident it is correct; leave them out otherwise.
- If the request has no dates, start the trip 30 days after today's date.`;

/**
 * Tells the model which language to write in. Place names stay as travellers
 * would search for them, and addresses stay in their local form so maps find them.
 */
export function languageInstruction(locale: Locale) {
  return `\n- Write every human-readable field (trip title, description, day titles, activity titles, descriptions, tips and summaries) in ${languageInEnglish[locale]}, whatever language the request is in. Keep proper names of places recognisable (use the name commonly used by ${languageInEnglish[locale]} speakers, or the local name), and keep street addresses in their local form so maps can find them.`;
}

const tripSpec = (locale: Locale) => ({ system: SYSTEM_PROMPT + languageInstruction(locale), schema: generatedTripSchema });
const toLocaleArg = (language?: string): Locale => (isLocale(language) ? language : defaultLocale);

/**
 * Generates a full Trip -> SubTrip -> Activity tree from a free-text prompt
 * (e.g. "5 days in Tokyo on a moderate budget"), saves it, and returns the new trip id.
 *
 * The model is picked per request by lib/modelRouter.ts. Needs one of these on Convex:
 *   npx convex env set AI_GATEWAY_API_KEY ...         (Vercel AI Gateway, any provider)
 *   npx convex env set ANTHROPIC_API_KEY sk-ant-...   (Claude API directly)
 */
export const generateTrip = action({
  args: {
    prompt: v.string(),
    /** App language ("es", "ja", …). The itinerary is written in it. Defaults to English. */
    language: v.optional(v.string()),
  },
  handler: async (ctx, { prompt, language }): Promise<Id<"trips">> => {
    const userId = await getUserId(ctx);
    const locale = toLocaleArg(language);
    const t = translator(locale);
    const request = prompt.trim();
    if (request.length < 3) throw new Error(t("errors.describeTrip"));
    if (request.length > 2000) throw new Error(t("errors.tooLong"));
    const via = aiVia();
    if (!via) {
      throw new Error("AI is not set up: add AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY to the Convex deployment");
    }
    const TRIP_SPEC = tripSpec(locale);

    const today = new Date().toISOString().slice(0, 10);
    const content = `Today is ${today}.\n\nTrip request: ${request}`;

    // Start on the cheapest tier that fits the request; if its answer is cut off or
    // incomplete, retry once per tier upward instead of failing.
    let tier: Tier | null = classifyRequest(request).tier;
    let lastError = t("errors.incomplete");

    while (tier) {
      const models = modelsFor(tier, via);
      const result =
        via === "gateway"
          ? await generateViaGateway(models, tier, content, TRIP_SPEC)
          : await generateViaAnthropic(models[0]!, tier, content, TRIP_SPEC);

      if (result.refused) {
        throw new Error(t("errors.refused"));
      }
      if (result.trip && !result.truncated && result.trip.subTrips.length > 0) {
        return ctx.runMutation(internal.trips.saveGenerated, {
          userId,
          prompt: request,
          model: result.model,
          tree: toTripTree(result.trip),
        });
      }
      if (result.truncated) lastError = t("errors.tooManyDays");
      tier = process.env.AI_MODEL ? null : nextTier(tier);
    }
    throw new Error(lastError);
  },
});

const improveResult = v.union(
  v.object({
    ok: v.literal(true),
    improved: v.string(),
    model: v.string(),
    questions: v.array(
      v.object({ topic: v.string(), question: v.string(), options: v.array(v.object({ label: v.string(), addition: v.string() })) }),
    ),
  }),
  v.object({ ok: v.literal(false), reason: v.union(v.literal("limit"), v.literal("unavailable")) }),
);
type ImproveOutcome = ({ ok: true } & ImproveResult) | { ok: false; reason: "limit" | "unavailable" };

/**
 * "Improve with AI" on the Plan with AI screen: rewrites a rough trip request into a
 * clear brief on the cheap tier, never inventing details, and returns the missing
 * ones as short questions with tap-to-answer chips. Nothing is saved, and it doesn't
 * count against the trip allowance; it's limited per hour (lib/promptBrief.ts).
 * It never throws for a model problem: the app keeps the person's own text instead.
 */
export const improvePrompt = action({
  args: {
    prompt: v.string(),
    /** App language, used only when the request's own language is unclear. */
    language: v.optional(v.string()),
  },
  returns: improveResult,
  handler: async (ctx, { prompt, language }): Promise<ImproveOutcome> => {
    const userId = await getUserId(ctx);
    const locale = toLocaleArg(language);
    const t = translator(locale);
    const request = prompt.trim();
    if (request.length < 3) throw new Error(t("errors.describeTrip"));
    if (request.length > 2000) throw new Error(t("errors.tooLong"));
    const via = aiVia();
    if (!via) return { ok: false, reason: "unavailable" };
    if (!(await ctx.runMutation(internal.prompts.takeImproveSlot, { userId }))) return { ok: false, reason: "limit" };

    const today = new Date().toISOString().slice(0, 10);
    const content = `Today is ${today}. If the language of the request is unclear, write in ${languageInEnglish[locale]}.\n\nTraveler's request:\n"""\n${request}\n"""`;
    try {
      const result = await generateStructured(via, "simple", content, { system: IMPROVE_SYSTEM_PROMPT, schema: promptBriefSchema });
      const improved = result.trip && !result.truncated && !result.refused ? toImproveResult(result.trip, request, result.model) : null;
      return improved ? { ok: true, ...improved } : { ok: false, reason: "unavailable" };
    } catch (error) {
      console.error("improvePrompt failed", error);
      return { ok: false, reason: "unavailable" };
    }
  },
});

const REPLAN_PROMPT = `You are an expert travel planner adjusting one day of an existing itinerary.

- Keep the activities that still make sense (pass their keepId), and move their times if needed.
- Replace the ones that don't fit the new conditions with real, currently operating places nearby with accurate street addresses.
- When it's rainy or stormy, prefer indoor or covered places (museums, food halls, galleries, arcades, onsen, covered markets) and keep outdoor time short.
- Keep the day's pace: about the same number of stops, in a sensible order with travel time between them. Keep meals at normal times.
- Only include a phone number, booking URL or website when you are confident it is correct.
- Activities with "done": true already happened: keep them (pass their keepId) and don't change them.
- When you're told the current time, it's the traveler's live day: schedule every remaining stop at or after that time, leaving travel time between stops, and favour places close to each other.`;

type ReplanDay = {
  tripTitle: string;
  destination: string;
  dayNumber: number;
  date?: string;
  location?: string;
  activities: { id: string; title: string; category: string; startTime?: string; durationMinutes?: number; address: string; description: string; done: boolean }[];
};
export type ReplanProposal = {
  summary: string;
  model: string;
  activities: (
    | { keepId: string; title: string; startTime?: string; durationMinutes?: number }
    | (ReturnType<typeof toNewActivity> & { isNew: true })
  )[];
};

/**
 * Stops already done are never moved, re-timed or dropped, whatever the model
 * said: they go first, as they were, and the plan follows.
 */
export function keepDoneFirst(current: ReplanDay["activities"], planned: ReplanProposal["activities"]): ReplanProposal["activities"] {
  const done = current.filter((a) => a.done);
  const doneIds = new Set(done.map((a) => a.id));
  return [
    ...done.map((a) => ({ keepId: a.id, title: a.title, startTime: a.startTime, durationMinutes: a.durationMinutes })),
    ...planned.filter((a) => !("keepId" in a && doneIds.has(a.keepId))),
  ];
}

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
    /** Local "HH:MM" when re-planning the rest of a day that's under way (today mode). */
    now: v.optional(v.string()),
    /** App language; new stops and the summary are written in it. */
    language: v.optional(v.string()),
  },
  returns: replanResult,
  handler: async (ctx, { subTripId, reason, weather, now, language }): Promise<ReplanProposal> => {
    const userId = await getUserId(ctx);
    const locale = toLocaleArg(language);
    const t = translator(locale);
    const day: ReplanDay | null = await ctx.runQuery(internal.activities.dayForReplan, { subTripId, userId });
    if (!day) throw new Error(t("errors.organizerOnly"));
    const via = aiVia();
    if (!via) throw new Error("AI is not set up: add AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY to the Convex deployment");

    const forecast = weather ? `Forecast: ${weather.label}, ${weather.high}°/${weather.low}°C, ${weather.rainChance}% chance of rain.\n` : "";
    const content = `Trip: ${day.tripTitle} in ${day.destination}.\nDay ${day.dayNumber}${day.date ? ` (${day.date})` : ""}${day.location ? ` in ${day.location}` : ""}.\n${forecast}${now && /^\d{2}:\d{2}$/.test(now) ? `It's ${now} there right now. Only re-plan what's still ahead today.\n` : ""}Why re-plan: ${reason.trim().slice(0, 300) || "Make the day better"}.\n\nCurrent plan (JSON):\n${JSON.stringify(day.activities)}`;

    let tier: Tier | null = "standard";
    while (tier) {
      const models = modelsFor(tier, via);
      const spec = { system: REPLAN_PROMPT + languageInstruction(locale), schema: replanSchema };
      const result = via === "gateway" ? await generateViaGateway(models, tier, content, spec) : await generateViaAnthropic(models[0]!, tier, content, spec);
      if (result.refused) throw new Error(t("errors.replanRefused"));
      const plan = result.trip;
      if (plan && !result.truncated && plan.activities.length > 0) {
        const known = new Set(day.activities.map((a) => a.id));
        return {
          summary: plan.summary,
          model: result.model,
          activities: keepDoneFirst(
            day.activities,
            plan.activities.map(({ keepId, ...a }) =>
              keepId && known.has(keepId)
                ? { keepId, title: day.activities.find((x) => x.id === keepId)!.title, startTime: a.startTime, durationMinutes: Math.max(0, Math.round(a.durationMinutes)) }
                : { ...toNewActivity(a, day.destination), isNew: true as const },
            ),
          ),
        };
      }
      tier = process.env.AI_MODEL ? null : nextTier(tier);
    }
    throw new Error(t("errors.replanIncomplete"));
  },
});
