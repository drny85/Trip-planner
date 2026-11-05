/**
 * Real photos of restaurants, cafés, hotels and other places Wikipedia doesn't
 * cover, from Google Places API (New). Needs GOOGLE_PLACES_API_KEY on the deployment.
 *
 * Google's terms let us keep a place ID forever, but not a photo name or photo
 * URL (both expire). So a trip stores a link to our own /place-photo/<placeId>
 * route (see http.ts), which looks up a fresh photo each time and redirects to it.
 */

const API = "https://places.googleapis.com/v1";

export const googlePlacesKey = () => process.env.GOOGLE_PLACES_API_KEY || undefined;

type Photo = { name: string; authorAttributions?: Array<{ displayName?: string }> };

const creditOf = (photo: Photo | undefined) =>
  photo?.authorAttributions
    ?.map((a) => a.displayName?.trim())
    .filter(Boolean)
    .join(", ") || undefined;

/**
 * Finds the place an activity is at, if Google has photos of it.
 * `credit` is the photographer, which Google asks us to show with the photo.
 */
export async function findGooglePlace(
  title: string,
  where: string,
  key: string,
): Promise<{ placeId: string; credit?: string } | null> {
  try {
    const res = await fetch(`${API}/places:searchText`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.photos",
      },
      body: JSON.stringify({ textQuery: where ? `${title}, ${where}` : title, pageSize: 1 }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { places?: Array<{ id?: string; photos?: Photo[] }> };
    const place = data.places?.[0];
    if (!place?.id || !place.photos?.length) return null;
    return { placeId: place.id, credit: creditOf(place.photos[0]) };
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
    const photo = ((await details.json()) as { photos?: Photo[] }).photos?.[0];
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
