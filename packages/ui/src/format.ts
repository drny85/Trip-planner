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
export const links = {
  phone: (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`,
  directions: (place: { address: string; latitude?: number; longitude?: number }) => {
    const destination =
      place.latitude != null && place.longitude != null
        ? `${place.latitude},${place.longitude}`
        : place.address;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  },
};
