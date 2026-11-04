/** "2027-04-02" -> "Apr 2". Parsed as a calendar date, so no timezone shift. */
export function formatDay(isoDate: string, locale = "en-US") {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "2027-04-02", "2027-04-06" -> "Apr 2 – Apr 6". */
export function formatDateRange(start: string, end: string, locale = "en-US") {
  return `${formatDay(start, locale)} – ${formatDay(end, locale)}`;
}

/** Link builders for the activity action buttons, shared by web and mobile. */
type Place = { address: string; latitude?: number; longitude?: number };
const placeQuery = (p: Place) => (p.latitude != null && p.longitude != null ? `${p.latitude},${p.longitude}` : p.address);

export const links = {
  /** Google Maps directions through every stop of a day, in order (up to 9 waypoints). */
  route: (places: Place[]) => {
    if (places.length === 0) return "https://www.google.com/maps";
    const stops = places.slice(0, 10).map(placeQuery);
    const destination = stops.at(-1)!;
    const waypoints = stops.slice(0, -1);
    const params = new URLSearchParams({ api: "1", destination, travelmode: "walking" });
    if (waypoints.length) params.set("waypoints", waypoints.join("|"));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  },
  phone: (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`,
  directions: (place: { address: string; latitude?: number; longitude?: number }) => {
    const destination =
      place.latitude != null && place.longitude != null
        ? `${place.latitude},${place.longitude}`
        : place.address;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  },
};
