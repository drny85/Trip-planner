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
  "exploration", "exploring", "wander", "wandering", "stop", "break", "relax", "relaxing", "picnic",
  // Articles and joining words in Spanish, Portuguese, French and Italian place names.
  "del", "los", "las", "das", "dos", "les", "des", "della", "der", "den",
]);

/**
 * Words that name a kind of place, not a place. A Wikipedia page that shares only
 * one of these ("Factory", "Sea") is a different place, so they never count as a match.
 */
const GENERIC = new Set([
  "sea", "factory", "market", "park", "museum", "church", "cathedral", "restaurant", "cafe", "bar", "pub", "beach",
  "garden", "gardens", "tower", "square", "street", "palace", "castle", "temple", "shrine", "bridge", "river", "lake",
  "station", "airport", "hill", "bay", "harbour", "harbor", "port", "food", "seafood", "fish", "wine", "beer", "tavern",
  "bistro", "grill", "kitchen", "house", "hall", "center", "centre", "plaza", "mall", "store", "shop", "gallery",
  "boat", "cruise", "ferry", "lagoon", "island", "cave", "waterfall", "falls", "mountain", "valley", "village", "city",
  // The same kinds of place in Spanish, Portuguese, French and Italian, plus saints' names
  // ("Laguna Gri-Gri" is not "San Cristóbal de La Laguna").
  "laguna", "playa", "praia", "plage", "spiaggia", "iglesia", "igreja", "eglise", "chiesa", "catedral", "parque",
  "museo", "musee", "mercado", "marche", "mercato", "lago", "isla", "ilha", "cueva", "bahia", "puerto", "porto",
  "calle", "rua", "castillo", "castelo", "monte", "cerro", "piazza", "playita", "rio", "salto", "cascada",
  "san", "santa", "santo", "sao", "saint", "sainte",
]);

/** Distinctive words of a place name ("Visit Senso-ji Temple" → ["senso", "temple"]). */
export const keywords = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

type Page = { title: string; index?: number; description?: string; thumbnail?: { source: string; width: number; height: number } };

/**
 * Pages that are about something other than a place to visit, judged by Wikipedia's
 * short description: people ("Portuguese politician", "(1939–2021)"), maps, works,
 * and transit stops (the "Baixa-Chiado" metro station is not the neighborhood).
 */
const NOT_A_PLACE =
  /\b(politician|footballer|player|actor|actress|singer|musician|rapper|writer|poet|novelist|painter|sculptor|composer|businessman|businesswoman|journalist|explorer|navigator|cartographer|monarch|president|prime minister|born|map|planisphere|album|song|film|novel|television|video game|band|ship|metro station|railway station|train station|subway station|bus station|tram stop)\b|\(\d{3,4}\s*[–-]\s*\d{3,4}\)/i;

/** True when a search result is about something other than the place we're after. */
export function isOffTopic(page: Pick<Page, "description">, name: string) {
  const description = page.description ?? "";
  if (!NOT_A_PLACE.test(description)) return false;
  // A trip stop that is itself a station keeps station pages.
  return !(/station|metro|subway/i.test(description) && /station|metro|subway/i.test(name));
}

/**
 * Searches Wikipedia for `query` and returns the lead image of the best page that
 * shares a distinctive word with `name`, so a vague search can't attach an
 * unrelated photo. Returns null when nothing trustworthy is found.
 */
export async function findPlacePhoto(name: string, context: string, width = 1200): Promise<string | null> {
  const wanted = keywords(decodeEntities(name));
  // Only a distinctive word ("Alfama", not "Sea" or "Factory") can confirm a match.
  const distinctive = wanted.filter((w) => !GENERIC.has(w));
  if (distinctive.length === 0) return null;
  // A long activity name needs two of its words on the page, so one shared word
  // can't attach a different place. A destination ("Tokyo & Kyoto, Japan", looked
  // up with no context) names several places, so one is enough there.
  const needed = context && distinctive.length >= 3 ? 2 : 1;
  // Wikipedia search wants every word to match, so filler like "Walk through" or
  // "Lunch at" finds nothing. Try the distinctive words with the city, then the
  // first distinctive word (usually the place) with the city, then the words alone.
  const city = context.split(",")[0]!.trim();
  const queries = [...new Set([`${wanted.join(" ")} ${city}`, `${distinctive[0]} ${city}`, wanted.join(" ")].map((q) => q.trim()))];
  for (const query of queries) {
    const found = await search(query, distinctive, width, needed, name);
    if (found) return found;
  }
  console.log(`No Wikipedia photo for "${name}" (${context})`);
  return null;
}

async function search(query: string, wanted: string[], width: number, needed = 1, name = ""): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "5",
    prop: "pageimages|description",
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
      if (isOffTopic(page, name)) continue;
      const titleWords = new Set(keywords(page.title));
      if (wanted.filter((w) => titleWords.has(w)).length >= needed) return thumb.source;
    }
  } catch (e) {
    console.log(`Wikipedia search error for "${query}": ${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}
