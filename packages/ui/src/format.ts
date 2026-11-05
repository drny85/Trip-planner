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

/** 3000, "JPY" -> "¥3,000". Falls back to a plain number for an unknown currency code. */
export function formatMoney(amount: number, currency = "USD", locale = "en-US") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString(locale)} ${currency}`;
  }
}

/** The device's local date as "YYYY-MM-DD". */
export function localToday(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 0 -> "Today", 1 -> "Tomorrow", 5 -> "In 5 days", negative -> "Day N of your trip". */
export function countdown(startsInDays: number, dayNumber: number) {
  if (startsInDays > 1) return `In ${startsInDays} days`;
  if (startsInDays === 1) return "Tomorrow";
  if (startsInDays === 0) return "Today";
  return `Day ${dayNumber} of your trip`;
}

/** "14:30" → "2:30 PM". Anything that isn't HH:MM passes through unchanged. */
export function formatTime(hhmm: string | undefined | null): string {
  if (!hhmm) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h = Number(m[1]);
  if (h > 23) return hhmm;
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Reads what someone typed ("7:30 pm", "7pm", "19:30", "0930") into the stored
 * 24-hour "HH:MM". Returns null when it isn't a time.
 */
export function parseTime(input: string): string | null {
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*([ap])?\.?\s*m?\.?$/i.exec(input.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3]?.toLowerCase();
  if (min > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ampm === "p" ? 12 : 0);
  } else if (h > 23 || (m[2] === undefined && input.trim().length > 2)) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
