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
  rainSoon,
  todayAlerts,
  todayStatus,
  toMinutes,
  type Coords,
  type HourWeather,
  type LiveWeather,
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
