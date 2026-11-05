import { z } from "zod";
import type { Id } from "../_generated/dataModel";

/**
 * The trip story: what the model reads (StoryInput), the JSON shape it must
 * return (storySchema), and the clean-up that keeps only ids we gave it.
 * Pure, so it's unit-tested without a model.
 */

export type StoryStop = {
  id: Id<"activities">;
  title: string;
  category?: string;
  address: string;
  notes: { by: string; text: string }[];
  photoCaptions: string[];
  photoCount: number;
};

export type StoryInput = {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: string[];
  days: { id: Id<"subTrips">; dayNumber: number; title: string; date?: string; location?: string; done: StoryStop[] }[];
};

export type StoryChapter = { subTripId: Id<"subTrips">; heading: string; body: string; activityIds: Id<"activities">[] };
export type Story = { title: string; intro: string; chapters: StoryChapter[]; closing: string };

export const STORY_PROMPT = `You are a warm, vivid travel writer. Write the story of a trip that has already happened, from the travelers' point of view ("we").

- Use only what the input says happened: the completed stops, the travelers' own notes and their photo captions. Never invent events, people, weather or meals that aren't there.
- Quote or closely echo the travelers' notes where they're good, and name who said it when it adds warmth.
- One chapter per day that has completed stops, in order, each with a short evocative heading and one or two short paragraphs.
- In each chapter, list the ids of the stops it mentions, in the order they happened. Use ids exactly as given.
- Keep it light and personal, like a story you'd share with friends. No bullet points, no markdown, no emoji.`;

export const storySchema = z.object({
  title: z.string().describe('A short story title, e.g. "Five days of ramen and temples"'),
  intro: z.string().describe("Two or three sentences that set the scene"),
  chapters: z.array(
    z.object({
      dayId: z.string().describe("The id of the day this chapter covers, exactly as given"),
      heading: z.string().describe("A short, evocative heading for the day"),
      body: z.string().describe("One or two short paragraphs"),
      stopIds: z.array(z.string()).describe("Ids of the stops this chapter mentions, in order"),
    }),
  ),
  closing: z.string().describe("One or two sentences to end on"),
});

export type GeneratedStory = z.infer<typeof storySchema>;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** The compact JSON the model reads. Ids stay as they are so the reply can point back at them. */
export function storyPrompt(input: StoryInput): string {
  const days = input.days
    .filter((d) => d.done.length > 0)
    .map((d) => ({
      id: d.id,
      day: d.dayNumber,
      title: d.title,
      date: d.date,
      location: d.location,
      stops: d.done.map((s) => ({
        id: s.id,
        title: s.title,
        category: s.category,
        address: s.address,
        notes: s.notes.map((n) => `${n.by}: ${clip(n.text, 500)}`),
        photos: s.photoCount,
        captions: s.photoCaptions.slice(0, 5).map((c) => clip(c, 140)),
      })),
    }));
  return `Trip: ${input.title}, ${input.destination}, ${input.startDate} to ${input.endDate}.\nTravelers: ${input.travelers.join(", ") || "us"}.\n\nWhat happened (JSON):\n${JSON.stringify(days)}`;
}

/** Keeps the reply's chapters that point at real days, and stops that belong to them. */
export function toStory(raw: GeneratedStory, input: StoryInput): Story | null {
  const days = new Map(input.days.map((d) => [d.id as string, d]));
  const seen = new Set<string>();
  const chapters: StoryChapter[] = [];
  for (const c of raw.chapters) {
    const day = days.get(c.dayId.trim());
    if (!day || seen.has(day.id) || !c.body.trim()) continue;
    seen.add(day.id);
    const stops = new Set(day.done.map((s) => s.id as string));
    chapters.push({
      subTripId: day.id,
      heading: clip(c.heading.trim() || day.title, 120),
      body: clip(c.body.trim(), 4000),
      activityIds: [...new Set(c.stopIds.map((id) => id.trim()))].filter((id) => stops.has(id)) as Id<"activities">[],
    });
  }
  // Chapters follow the trip's order even if the model shuffled them.
  const order = new Map(input.days.map((d, i) => [d.id as string, i]));
  chapters.sort((a, b) => order.get(a.subTripId)! - order.get(b.subTripId)!);
  if (chapters.length === 0) return null;
  return {
    title: clip(raw.title.trim() || input.title, 120),
    intro: clip(raw.intro.trim(), 1500),
    chapters,
    closing: clip(raw.closing.trim(), 1000),
  };
}

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/**
 * A plain story built from the notes when no AI key is set on the deployment,
 * so the journal still works in demo mode.
 */
export function templateStory(input: StoryInput): Story | null {
  const chapters = input.days
    .filter((d) => d.done.length > 0)
    .map((d): StoryChapter => {
      const notes = d.done.flatMap((s) => s.notes.map((n) => `"${clip(n.text, 300)}" (${n.by}, at ${s.title})`));
      const body = [`We made it to ${list(d.done.map((s) => s.title))}.`, ...notes].join(" ");
      return { subTripId: d.id, heading: d.location ? `Day ${d.dayNumber} in ${d.location}` : d.title, body, activityIds: d.done.map((s) => s.id) };
    });
  if (chapters.length === 0) return null;
  const stops = input.days.reduce((n, d) => n + d.done.length, 0);
  return {
    title: `Our ${input.destination} story`,
    intro: `${list(input.travelers) || "We"} set off for ${input.destination}. Here's what we got up to, ${stops} ${stops === 1 ? "stop" : "stops"} in all.`,
    chapters,
    closing: `Until the next trip.`,
  };
}
