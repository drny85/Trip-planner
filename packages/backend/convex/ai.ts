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
import { cleanPreferences, preferenceRules } from "./lib/interview";
import { IMPROVE_SYSTEM_PROMPT, type ImproveResult, promptBriefSchema, toImproveResult } from "./lib/promptBrief";
import { type GeneratedTrip, generatedTripSchema, localPickSchema, replanSchema, tipsSchema, toInsights, toNewActivity, toTripTree } from "./lib/tripSchema";

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

/** Shared by every prompt that writes activities: local tips and crowd forecasts. */
const LOCAL_KNOWLEDGE = `- Give each top-level activity 1 to 3 short tips a local would give about that exact place: the best time to go to beat the crowds, what to order or try, free days, discounts or passes, a trick locals know, or what to skip. Only state opening days, free days and prices you are confident about; otherwise give a tip that doesn't depend on them.
- Give each top-level activity except transport and stays a crowd forecast for its planned start time on that weekday, with the day's busiest stretch and the calmest good time to arrive. Prefer start times that avoid the peak when the day allows it.
- Set isLocalPick only on places mostly locals know and love, not on major tourist sights.`;

/** Asked for with "hidden gems" on: favour local favourites over the big sights. */
const LOCAL_FOCUS = `
- The traveler wants hidden gems. Favour places locals love over famous tourist sights: keep at most one must-see a day, and pick neighbourhood restaurants, markets, cafés, parks and small museums where locals actually go.`;

const SYSTEM_PROMPT = `You are an expert travel planner. Turn the traveller's request into a complete, realistic itinerary.

- Use real, currently operating places with accurate street addresses.
- Group activities by day (or by multi-day leg when the traveller changes city), in the order they'd be done, with sensible start times and travel time between them.
- Respect the budget, pace and interests in the request. Mix sights, food and downtime.
- Only include a phone number, booking URL or website when you are confident it is correct; leave them out otherwise.
- If the request has no dates, start the trip 30 days after today's date.
${LOCAL_KNOWLEDGE}`;

/**
 * Tells the model which language to write in. Place names stay as travellers
 * would search for them, and addresses stay in their local form so maps find them.
 */
export function languageInstruction(locale: Locale) {
  return `\n- Write every human-readable field (trip title, description, day titles, activity titles, descriptions, tips and summaries) in ${languageInEnglish[locale]}, whatever language the request is in. Keep proper names of places recognisable (use the name commonly used by ${languageInEnglish[locale]} speakers, or the local name), and keep street addresses in their local form so maps can find them.`;
}

const tripSpec = (locale: Locale, localFocus = false) => ({
  system: SYSTEM_PROMPT + (localFocus ? LOCAL_FOCUS : "") + languageInstruction(locale),
  schema: generatedTripSchema,
});
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
    /** "Hidden gems": favour places locals love over the big tourist sights. */
    localFocus: v.optional(v.boolean()),
    /** Answers from the guided interview (lib/interview.ts), followed as exact rules. */
    preferences: v.optional(
      v.object({
        destination: v.string(),
        days: v.optional(v.number()),
        month: v.optional(v.string()),
        travelers: v.optional(v.string()),
        budget: v.optional(v.string()),
        pace: v.optional(v.string()),
        interests: v.optional(v.array(v.string())),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { prompt, language, preferences, localFocus }): Promise<Id<"trips">> => {
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
    const TRIP_SPEC = tripSpec(locale, localFocus);

    const today = new Date().toISOString().slice(0, 10);
    const prefs = preferences?.destination.trim() ? cleanPreferences(preferences) : null;
    const content = prefs
      ? `Today is ${today}.\n\nTrip request: ${request}\n\nThe traveler answered a short interview. Follow these exactly:\n${preferenceRules(prefs)}`
      : `Today is ${today}.\n\nTrip request: ${request}`;

    // Start on the cheapest tier that fits the request; if its answer is cut off or
    // incomplete, retry once per tier upward instead of failing.
    let tier: Tier | null = classifyRequest(request, prefs?.days).tier;
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
- When you're told the current time, it's the traveler's live day: schedule every remaining stop at or after that time, leaving travel time between stops, and favour places close to each other.
- Give each new stop 1 to 3 short local tips and a crowd forecast for its planned time, as a local would.`;

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

/** "Saturday" for "2027-04-03": crowds depend on the day of the week. */
const weekdayOf = (date?: string) =>
  date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : null;

type LocalDay = {
  tripTitle: string;
  destination: string;
  dayNumber: number;
  date?: string;
  location?: string;
  activities: { id: string; title: string; category: string; startTime?: string; durationMinutes?: number; address: string; description: string; locked: boolean }[];
};

const dayHeader = (day: LocalDay) => {
  const weekday = weekdayOf(day.date);
  return `Trip: ${day.tripTitle} in ${day.destination}.\nDay ${day.dayNumber}${day.date ? ` (${day.date}${weekday ? `, a ${weekday}` : ""})` : ""}${day.location ? ` in ${day.location}` : ""}.\n`;
};

const LOCAL_PICK_PROMPT = `You are a local who knows this place well, reworking one day of a visitor's itinerary into a "local's pick" day.

- Swap tourist-heavy stops (famous sights with long queues, tourist-trap restaurants, chain shops) for real, currently operating places locals love nearby, of the same kind and at a similar time and price. For example, a neighbourhood shrine instead of the famous one, or the counter where locals queue instead of the restaurant on every list.
- Keep at most one famous sight if it's truly worth it. Always keep stops marked "locked" (pass their keepId): they are done, booked, or have photos or notes.
- For each new stop, set "replaces" to the title of the stop it swaps out, set isLocalPick to true, and say in the description why locals love it.
- Keep the day's pace, meal times and area, in a sensible order with travel time between stops.
- Use accurate street addresses. Only include a phone number, booking URL or website when you are confident it is correct.
${LOCAL_KNOWLEDGE}
- Give kept stops tips and a crowd forecast too.`;

const TIPS_PROMPT = `You are a local who knows this place well. For each planned stop, add what a local would tell a visitor.
- Return one entry per activity, with its id exactly as given.
${LOCAL_KNOWLEDGE}`;

export type LocalPickProposal = {
  summary: string;
  model: string;
  activities: (
    | { keepId: string; title: string; startTime?: string; durationMinutes?: number; localTips?: ReturnType<typeof toInsights>["localTips"]; crowd?: ReturnType<typeof toInsights>["crowd"] }
    | (ReturnType<typeof toNewActivity> & { isNew: true; replaces?: string })
  )[];
};

const localPickResult = v.object({ summary: v.string(), model: v.string(), activities: v.array(v.any()) });

/**
 * "Local's pick" for one day: proposes swapping its tourist-heavy stops for
 * places locals love, with tips and crowd forecasts. Nothing changes until the
 * organizer applies it (localPicks.apply), and it can be undone (localPicks.restore).
 */
export const localPickDay = action({
  args: { subTripId: v.id("subTrips"), language: v.optional(v.string()) },
  returns: localPickResult,
  handler: async (ctx, { subTripId, language }): Promise<LocalPickProposal> => {
    const userId = await getUserId(ctx);
    const locale = toLocaleArg(language);
    const t = translator(locale);
    const day: LocalDay | null = await ctx.runQuery(internal.localPicks.dayForLocal, { subTripId, userId });
    if (!day) throw new Error(t("errors.organizerOnly"));
    const via = aiVia();
    if (!via) throw new Error("AI is not set up: add AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY to the Convex deployment");

    const content = `${dayHeader(day)}\nCurrent plan (JSON):\n${JSON.stringify(day.activities)}`;
    const spec = { system: LOCAL_PICK_PROMPT + languageInstruction(locale), schema: localPickSchema };
    const byId = new Map(day.activities.map((a) => [a.id, a]));

    let tier: Tier | null = "standard";
    while (tier) {
      const result = await generateStructured(via, tier, content, spec);
      if (result.refused) throw new Error(t("errors.replanRefused"));
      const plan = result.trip;
      if (plan && !result.truncated && plan.activities.length > 0) {
        const seen = new Set<string>();
        const planned: LocalPickProposal["activities"] = plan.activities.flatMap(({ keepId, replaces, ...a }): LocalPickProposal["activities"] => {
          if (keepId && byId.has(keepId)) {
            if (seen.has(keepId)) return [];
            seen.add(keepId);
            const { localTips, crowd } = toInsights(a);
            return [{ keepId, title: byId.get(keepId)!.title, startTime: a.startTime, durationMinutes: Math.max(0, Math.round(a.durationMinutes)), localTips, crowd }];
          }
          // A new stop is a local pick by definition.
          return [{ ...toNewActivity({ ...a, isLocalPick: true }, day.destination), isNew: true as const, replaces: replaces?.trim() || undefined }];
        });
        // Locked stops the model forgot stay, as they are, after the plan.
        const forgotten = day.activities
          .filter((a) => a.locked && !seen.has(a.id))
          .map((a) => ({ keepId: a.id, title: a.title, startTime: a.startTime, durationMinutes: a.durationMinutes }));
        return { summary: plan.summary, model: result.model, activities: [...planned, ...forgotten] };
      }
      tier = process.env.AI_MODEL ? null : nextTier(tier);
    }
    throw new Error(t("errors.replanIncomplete"));
  },
});

/**
 * Adds local tips and a crowd forecast to a day's stops without changing the
 * plan, for trips made before tips existed (or a day the organizer edited).
 * Returns how many stops got tips.
 */
export const addLocalTips = action({
  args: { subTripId: v.id("subTrips"), language: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, { subTripId, language }): Promise<number> => {
    const userId = await getUserId(ctx);
    const locale = toLocaleArg(language);
    const t = translator(locale);
    const day: LocalDay | null = await ctx.runQuery(internal.localPicks.dayForLocal, { subTripId, userId });
    if (!day) throw new Error(t("errors.organizerOnly"));
    if (day.activities.length === 0) return 0;
    const via = aiVia();
    if (!via) throw new Error("AI is not set up: add AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY to the Convex deployment");

    const stops = day.activities.map(({ locked: _l, ...a }) => a);
    const content = `${dayHeader(day)}\nPlanned stops (JSON):\n${JSON.stringify(stops)}`;
    const spec = { system: TIPS_PROMPT + languageInstruction(locale), schema: tipsSchema };
    let tier: Tier | null = "simple";
    while (tier) {
      const result = await generateStructured(via, tier, content, spec);
      if (result.refused) throw new Error(t("errors.replanRefused"));
      if (result.trip && !result.truncated && result.trip.activities.length > 0) {
        const known = new Set(stops.map((s) => s.id));
        const tips = result.trip.activities
          .filter((a) => known.has(a.id))
          .map((a) => ({ activityId: a.id as Id<"activities">, ...toInsights(a) }))
          .filter((a) => a.localTips || a.crowd);
        return ctx.runMutation(internal.localPicks.saveTips, { subTripId, tips });
      }
      tier = process.env.AI_MODEL ? null : nextTier(tier);
    }
    throw new Error(t("errors.replanIncomplete"));
  },
});
