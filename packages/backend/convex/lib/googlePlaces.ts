/**
 * Real photos of businesses (restaurants, bars, hotels, shops) from the Google
 * Places API (New). Wikipedia covers landmarks; this covers the places Wikipedia
 * has no page for. Off unless GOOGLE_PLACES_API_KEY is set on the deployment.
 *
 * Google's terms don't allow storing photo files or photo names, only place IDs.
 * So an activity's photoUrl points at our own /place-photo route with the place
 * ID, and that route looks up a fresh photo on each (cached) request. The API key
 * never leaves the backend.
 */

import { decodeEntities } from "./text";
import { keywords } from "./wikiPhotos";

const API = "https://places.googleapis.com/v1";

export const placesApiKey = () => process.env.GOOGLE_PLACES_API_KEY || undefined;

/** Place IDs look like "ChIJN1t_tDeuEmsRUsoyG83frY4". Anything else is refused. */
export const isPlaceId = (id: string) => /^[A-Za-z0-9_-]{10,300}$/.test(id);

/** Leading filler that isn't part of the place's name: "Dinner at A Cevicheria" → "A Cevicheria". */
const LEAD_IN =
  /^(?:(?:visit|explore|check[- ]?in|check[- ]?out|stay|lunch|dinner|breakfast|brunch|coffee|drinks|cocktails|tapas|shopping|shop|tour|eat|try|walk|stroll)\s+(?:at|in|to|of|on|around|through)?\s*)+/i;

export const placeName = (title: string) => decodeEntities(title).replace(LEAD_IN, "").trim() || title;

/** Width of a /place-photo request, clamped to what the Places API serves. */
export const clampWidth = (w: number) => (Number.isFinite(w) ? Math.min(1600, Math.max(200, Math.round(w))) : 1200);

export const placePhotoUrl = (siteUrl: string, placeId: string, width = 1200) =>
  `${siteUrl.replace(/\/$/, "")}/place-photo?place=${encodeURIComponent(placeId)}&w=${clampWidth(width)}`;

type SearchPlace = {
  id?: string;
  displayName?: { text?: string };
  photos?: Array<{ name?: string; authorAttributions?: Array<{ displayName?: string }> }>;
};

/**
 * Finds the Google place for an activity and returns its ID and the photo's
 * author (Google requires showing it). Only accepts a result whose name shares a
 * word with the activity, so a vague search can't attach some other business.
 */
export async function findGooglePlace(
  title: string,
  address: string,
  city: string,
): Promise<{ placeId: string; credit?: string } | null> {
  const key = placesApiKey();
  if (!key) return null;
  const name = placeName(title);
  const wanted = keywords(name);
  if (wanted.length === 0) return null;
  const where = address.trim() || city;

  try {
    const response = await fetch(`${API}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.photos",
      },
      body: JSON.stringify({ textQuery: `${name}, ${where}`, pageSize: 3 }),
    });
    if (!response.ok) {
      console.log(`Google Places search failed (${response.status}) for "${name}"`);
      return null;
    }
    const data = (await response.json()) as { places?: SearchPlace[] };
    for (const place of data.places ?? []) {
      if (!place.id || !place.photos?.length) continue;
      const found = new Set(keywords(place.displayName?.text ?? ""));
      if (!wanted.some((w) => found.has(w))) continue;
      const credit = place.photos[0]?.authorAttributions?.[0]?.displayName?.trim();
      return { placeId: place.id, credit: credit || undefined };
    }
  } catch (e) {
    console.log(`Google Places search error for "${name}": ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`No Google Places photo for "${title}" (${where})`);
  return null;
}

/** A short-lived URL of the place's first photo, or null. Used by the /place-photo route. */
export async function freshPhotoUri(placeId: string, width: number): Promise<string | null> {
  const key = placesApiKey();
  if (!key || !isPlaceId(placeId)) return null;
  try {
    const details = await fetch(`${API}/places/${placeId}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos" },
    });
    if (!details.ok) return null;
    const photoName = ((await details.json()) as SearchPlace).photos?.[0]?.name;
    if (!photoName) return null;
    const media = await fetch(
      `${API}/${photoName}/media?maxWidthPx=${clampWidth(width)}&skipHttpRedirect=true`,
      { headers: { "X-Goog-Api-Key": key } },
    );
    if (!media.ok) return null;
    return ((await media.json()) as { photoUri?: string }).photoUri ?? null;
  } catch {
    return null;
  }
}
