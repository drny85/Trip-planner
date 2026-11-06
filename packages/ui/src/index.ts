export { categoryLabel, categoryMeta, fallbackPhoto, getCategory, getSubcategory, subcategoryMeta, type Category } from "./categories";
export { cn } from "./cn";
export { countdown, formatDateRange, formatDay, formatMoney, formatTime, links, localToday, parseTime } from "./format";

/** "90" -> "1 h 30 min". */
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Whole days between two ISO dates, inclusive ("2027-04-02", "2027-04-06" -> 5). */
export function tripLength(start: string, end: string) {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}
export { toICS } from "./calendar";

/** "2027-04-02" moved by `days` ("2027-04-02", 3 -> "2027-04-05"). */
export function addDays(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Where "Use this trip" starts a copy: the original's start when that's still
 * ahead, otherwise two weeks from today.
 */
export function suggestedCopyStart(originalStart: string, today: string) {
  return originalStart > today ? originalStart : addDays(today, 14);
}

/** A copy's end date when it starts on `start` (same length as the original). */
export function copyEnd(original: { startDate: string; endDate: string }, start: string) {
  return addDays(start, tripLength(original.startDate, original.endDate) - 1);
}
export { describeWeather, forecastUrl, inForecastRange, parseForecast, type DayWeather, type WeatherKind } from "./weather";

/** "Day 2 · Kyoto" / "Día 2 · Kioto" / "2日目 · 京都" -> "Kyoto": drops the day prefix, since the apps show the day number already. */
export const dayTitle = (title: string) => title.replace(/^[^·\d]*\d+[^·\d]*·\s*/, "") || title;
export {
  distanceKm,
  estimateTravel,
  findTodayDay,
  fromMinutes,
  hasCoords,
  hourlyForecastUrl,
  isOutdoor,
  LATE_AFTER,
  leaveBy,
  minutesNow,
  parseHourly,
  projectDay,
  rainSoon,
  todayAlerts,
  todayStatus,
  toMinutes,
  type Coords,
  type HourWeather,
  type LiveWeather,
  type ProjectedStatus,
  type TodayAlert,
  type TodayStatus,
  type TodayStop,
  type TravelEstimate,
} from "./today";

/**
 * The credit to show on an activity photo from Google Places (Google requires
 * it): the photographer's name, "" when Google gave none, or null for any other photo.
 */
export function googlePhotoCredit(activity: { photoUrl?: string; photoCredit?: string }): string | null {
  if (!activity.photoUrl?.includes("/place-photo/")) return null;
  return activity.photoCredit ?? "";
}
export { currencyChoices, currencyForRegion, currencyFromLocales, CURRENCIES, isCurrencyCode } from "./currency";
