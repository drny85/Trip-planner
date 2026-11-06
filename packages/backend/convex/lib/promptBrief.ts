import { z } from "zod";
import { type ImproveQuestion, type ImproveResult, QUESTION_TOPICS, type QuestionTopic } from "./promptAnswer";

export type { ImproveQuestion, ImproveResult };

/**
 * "Improve with AI" on the Plan with AI screen: a cheap model turns a rough trip
 * request into a clear, well-structured one, without inventing anything, and
 * lists the details that are missing as short questions with tap-to-answer chips.
 */

/** How many improvements one person can ask for per hour. */
export const IMPROVE_LIMIT_PER_HOUR = 20;
export const HOUR_MS = 60 * 60 * 1000;


export const promptBriefSchema = z.object({
  improved: z
    .string()
    .describe(
      "The traveler's request rewritten as a clear, well-organized trip brief, in the same language they wrote in. Only facts they stated. No placeholders, no brackets, no questions.",
    ),
  brief: z.object({
    destinations: z.array(z.string()).describe("Places they named, in order. Empty if none."),
    dates: z.string().nullable().describe("Dates or month exactly as given, or null"),
    length: z.string().nullable().describe("Trip length as given, e.g. '5 days', or null"),
    travelers: z.string().nullable().describe("Who is going as given, or null"),
    budget: z.string().nullable().describe("Budget as given, or null"),
    pace: z.string().nullable().describe("Pace as given (relaxed, packed…), or null"),
    interests: z.array(z.string()).describe("Interests they named"),
    mustDo: z.array(z.string()).describe("Specific things they said they want to do or see"),
    avoid: z.array(z.string()).describe("Things they said to avoid"),
  }),
  questions: z
    .array(
      z.object({
        topic: z.string().describe(`One of: ${QUESTION_TOPICS.join(", ")}`),
        question: z.string().describe("Very short question, e.g. 'How many travelers?'"),
        options: z
          .array(
            z.object({
              label: z.string().describe("Chip text, 1 to 3 words, e.g. 'Couple'"),
              addition: z
                .string()
                .describe("A short sentence to append to the request when tapped, in the request's language, e.g. 'We are a couple.'"),
            }),
          )
          .describe("2 to 4 likely answers"),
      }),
    )
    .describe("Up to 4 questions for the most useful missing details. Empty when nothing important is missing."),
});

export type PromptBrief = z.infer<typeof promptBriefSchema>;


const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Keeps the model's answer inside what the app can show: real text, at most four
 * questions with two to four chips each, no duplicates, nothing over the input limit.
 */
export function toImproveResult(raw: PromptBrief, original: string, model: string): ImproveResult | null {
  const improved = raw.improved.trim().replace(/\n{3,}/g, "\n\n").slice(0, 2000);
  // A rewrite that lost most of the request, or still has fill-in-the-blank brackets, isn't usable.
  if (improved.length < Math.min(original.trim().length, 3) || /\[[^\]]*\]|\{[^}]*\}/.test(improved)) return null;

  const seen = new Set<string>();
  const questions: ImproveQuestion[] = [];
  for (const q of raw.questions) {
    const topic = (QUESTION_TOPICS as readonly string[]).includes(q.topic.trim().toLowerCase())
      ? (q.topic.trim().toLowerCase() as QuestionTopic)
      : "other";
    const question = clean(q.question).slice(0, 80);
    if (!question || (topic !== "other" && seen.has(topic))) continue;
    const options = q.options
      .map((o) => ({ label: clean(o.label).slice(0, 32), addition: clean(o.addition).slice(0, 200) }))
      .filter((o) => o.label && o.addition)
      .slice(0, 4);
    if (options.length < 2) continue;
    seen.add(topic);
    questions.push({ topic, question, options });
    if (questions.length === 4) break;
  }
  return { improved, questions, model };
}

export const IMPROVE_SYSTEM_PROMPT = `You help travelers write better requests for an AI trip planner. You do not plan the trip.

Rewrite the traveler's request into a clear, well-structured brief the planner can follow:
- Write in the same language the traveler used. Never translate it.
- Keep every detail they gave: places, dates, length, who is going, budget, pace, interests, must-dos, things to avoid, food needs, accessibility.
- NEVER invent or assume details they didn't give. No made-up dates, budgets, group sizes, hotels or interests. If something is missing, leave it out of the rewrite and ask about it instead.
- Organize it in short lines or sentences: where and how long first, then who and budget, then style and interests, then must-dos and things to avoid. Plain text only, no markdown headings, no brackets or placeholders.
- Keep it concise: usually under 120 words, never longer than needed.

Then list up to 4 questions about the missing details that would most change the plan (usually trip length or dates, travelers, budget, pace). Skip anything they already answered. Each question is very short and has 2 to 4 tap-to-answer options. Each option has a 1 to 3 word label and a short sentence, in the request's language, that adds the answer to the request.

If the request isn't about travel at all, return it unchanged with no questions.`;
