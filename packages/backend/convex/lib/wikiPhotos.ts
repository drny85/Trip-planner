/**
 * Finds a real photo of a named place from Wikipedia (free, no API key).
 * Used to replace the category stock photos with a picture of the actual place.
 */

import { decodeEntities } from "./text";

const API = "https://en.wikipedia.org/w/api.php";
// Wikimedia asks API clients to identify themselves.
const USER_AGENT = "TripPlanner/1.0 (https://github.com/drny85/Trip-planner)";

const STOPWORDS = new Set([
  "visit", "explore", "check", "lunch", "dinner", "breakfast", "brunch", "coffee", "drinks", "walk", "stroll",
  "tour", "toss", "coin", "the", "and", "with", "from", "into", "at", "in", "of", "to", "a", "an", "on", "for",
  "day", "trip", "evening", "morning", "afternoon", "night", "train", "ride", "take", "hike", "shop", "shopping",
  "see", "try", "eat", "enjoy", "discover", "head", "stay", "hostel", "hotel", "free", "time", "local",
  "through", "around", "along", "over", "near", "via", "sunset", "sunrise", "viewpoint", "views", "view", "district",
  "neighborhood", "neighbourhood", "quarter", "area", "old", "town", "historic", "experience", "visit", "explore",
]);

/** Distinctive words of a place name ("Visit Senso-ji Temple" → ["senso", "temple"]). */
export const keywords = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

type Page = { title: string; index?: number; thumbnail?: { source: string; width: number; height: number } };

/**
 * Searches Wikipedia for `query` and returns the lead image of the best page that
 * shares a distinctive word with `name`, so a vague search can't attach an
 * unrelated photo. Returns null when nothing trustworthy is found.
 */
export async function findPlacePhoto(name: string, context: string, width = 1200): Promise<string | null> {
  const wanted = keywords(decodeEntities(name));
  if (wanted.length === 0) return null;
  // Wikipedia search wants every word to match, so filler like "Walk through" or
  // "Lunch at" finds nothing. Try the distinctive words with the city, then the
  // first distinctive word (usually the place) with the city, then the words alone.
  const city = context.split(",")[0]!.trim();
  const queries = [...new Set([`${wanted.join(" ")} ${city}`, `${wanted[0]} ${city}`, wanted.join(" ")].map((q) => q.trim()))];
  for (const query of queries) {
    const found = await search(query, wanted, width);
    if (found) return found;
  }
  console.log(`No Wikipedia photo for "${name}" (${context})`);
  return null;
}

async function search(query: string, wanted: string[], width: number): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "5",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: String(width),
    pilicense: "free",
  });

  try {
    const response = await fetch(`${API}?${params}`, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) {
      console.log(`Wikipedia search failed (${response.status}) for "${query}"`);
      return null;
    }
    const data = (await response.json()) as { query?: { pages?: Page[] } };
    const pages = (data.query?.pages ?? []).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    for (const page of pages) {
      const thumb = page.thumbnail;
      if (!thumb || thumb.width < 400) continue;
      // Skip maps, flags, logos and diagrams.
      if (/\.(svg|png)/i.test(thumb.source) && !/\.jpe?g/i.test(thumb.source)) continue;
      const titleWords = new Set(keywords(page.title));
      if (wanted.some((w) => titleWords.has(w))) return thumb.source;
    }
  } catch (e) {
    console.log(`Wikipedia search error for "${query}": ${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}
