/**
 * Real photos of restaurants, cafés, hotels and other places Wikipedia doesn't
 * cover, from Google Places API (New). Needs GOOGLE_PLACES_API_KEY on the deployment.
 *
 * Google's terms let us keep a place ID forever, but not a photo name or photo
 * URL (both expire). So a trip stores a link to our own /place-photo/<placeId>
 * route (see http.ts), which looks up a fresh photo each time and redirects to it.
 */

import { decodeEntities } from "./text";
import { keywords } from "./wikiPhotos";

const API = "https://places.googleapis.com/v1";

/** Leading filler that isn't part of the place's name: "Dinner at A Cevicheria" → "A Cevicheria". */
const LEAD_IN =
  /^(?:(?:visit|explore|check[- ]?in|check[- ]?out|stay|lunch|dinner|breakfast|brunch|coffee|drinks|cocktails|tapas|shopping|shop|tour|eat|try|walk|stroll)\s+(?:at|in|to|of|on|around|through)?\s*)+/i;

export const placeName = (title: string) => decodeEntities(title).replace(LEAD_IN, "").trim() || title;

export const googlePlacesKey = () => process.env.GOOGLE_PLACES_API_KEY || undefined;

type Photo = { name: string; authorAttributions?: Array<{ displayName?: string }> };
type SearchPlace = { id?: string; displayName?: { text?: string }; photos?: Photo[] };

const creditOf = (photo: Photo | undefined) =>
  photo?.authorAttributions
    ?.map((a) => a.displayName?.trim())
    .filter(Boolean)
    .join(", ") || undefined;

/**
 * Finds the place an activity is at, if Google has photos of it. Only a result
 * whose name shares a word with the activity counts, so a vague search can't
 * attach some other business. `credit` is the photographer, which Google asks
 * us to show with the photo.
 */
export async function findGooglePlace(
  title: string,
  where: string,
  key: string,
): Promise<{ placeId: string; credit?: string } | null> {
  const name = placeName(title);
  const wanted = keywords(name);
  if (wanted.length === 0) return null;
  try {
    const res = await fetch(`${API}/places:searchText`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.photos",
      },
      body: JSON.stringify({ textQuery: where ? `${name}, ${where}` : name, pageSize: 3 }),
    });
    if (!res.ok) {
      console.log(`Google Places search failed (${res.status}) for "${name}"`);
      return null;
    }
    const data = (await res.json()) as { places?: SearchPlace[] };
    for (const place of data.places ?? []) {
      if (!place.id || !place.photos?.length) continue;
      const found = new Set(keywords(place.displayName?.text ?? ""));
      if (wanted.some((w) => found.has(w))) return { placeId: place.id, credit: creditOf(place.photos[0]) };
    }
    return null;
  } catch {
    return null;
  }
}

/** A fresh, short-lived URL of a place's first photo. */
export async function googlePhotoUri(placeId: string, key: string, width: number): Promise<string | null> {
  try {
    const details = await fetch(`${API}/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos" },
    });
    if (!details.ok) return null;
    const photo = ((await details.json()) as SearchPlace).photos?.[0];
    if (!photo) return null;
    const media = await fetch(`${API}/${photo.name}/media?maxWidthPx=${width}&skipHttpRedirect=true`, {
      headers: { "X-Goog-Api-Key": key },
    });
    if (!media.ok) return null;
    return ((await media.json()) as { photoUri?: string }).photoUri ?? null;
  } catch {
    return null;
  }
}

/** The photo link stored on an activity. */
export function placePhotoUrl(placeId: string, width = 1000) {
  const site = process.env.CONVEX_SITE_URL;
  return site ? `${site}/place-photo/${encodeURIComponent(placeId)}?w=${width}` : null;
}
