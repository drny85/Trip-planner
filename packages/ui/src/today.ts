import { describeWeather , type WeatherKind } from "./weather";

/**
 * Live "today" mode: which day of the trip is today, what's next, how far behind
 * schedule the traveler is, how long the next leg takes, and whether rain is on
 * the way. Pure functions so web and mobile behave the same and tests can pin it.
 */

export type TodayStop = {
  _id: string;
  title: string;
  isCompleted: boolean;
  startTime?: string;
  durationMinutes?: number;
  latitude?: number;
  longitude?: number;
  address: string;
  category?: string;
  subcategory?: string;
};
type Day = { _id: string; dayNumber: number; date?: string; activities: TodayStop[] };
export type Coords = { latitude: number; longitude: number };

/** "14:30" -> 870. Undefined when it isn't HH:MM. */
export function toMinutes(hhmm: string | undefined): number | undefined {
  const m = hhmm ? /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}

/** 870 -> "14:30", clamped to the same day. */
export function fromMinutes(minutes: number) {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes since local midnight on the device. */
export const minutesNow = (now = new Date()) => now.getHours() * 60 + now.getMinutes();

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The trip day that falls on `today`: by its date, or by its number counted from the start date. */
export function findTodayDay<D extends Day>(trip: { startDate: string; endDate: string; subTrips: D[] }, today: string): D | undefined {
  if (today < trip.startDate || today > trip.endDate) return undefined;
  return trip.subTrips.find((d) => d.date === today) ?? trip.subTrips.find((d) => !d.date && addDays(trip.startDate, d.dayNumber - 1) === today);
}

export type TodayStatus<S extends TodayStop> = {
  /** The open stop happening right now (started, not yet over). */
  current?: S;
  /** The next open stop to head to (the current one when it's under way). */
  next?: S;
  /** The open stops after `next`. */
  later: S[];
  /** The last stop already done, where the traveler probably is. */
  lastDone?: S;
  /** Minutes the schedule is behind: how long ago `next` should have started (or ended, if it's under way). */
  behindBy: number;
  done: number;
  total: number;
};

/** Where the day stands at `now` (minutes since midnight). */
export function todayStatus<S extends TodayStop>(stops: S[], now: number): TodayStatus<S> {
  const open = stops.filter((s) => !s.isCompleted);
  const next = open[0];
  const start = toMinutes(next?.startTime);
  const end = start != null ? start + (next?.durationMinutes ?? 60) : undefined;
  const current = next && start != null && start <= now && end! > now ? next : undefined;
  // Under way: late only once it should be over. Not started: late once its start has passed.
  const behindBy = next && start != null ? Math.max(0, now - (current ? end! : start)) : 0;
  return {
    current,
    next,
    later: open.slice(1),
    lastDone: [...stops].reverse().find((s) => s.isCompleted),
    behindBy,
    done: stops.length - open.length,
    total: stops.length,
  };
}

/** Straight-line distance in km. */
export function distanceKm(a: Coords, b: Coords) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export type TravelEstimate = { mode: "walk" | "transit"; minutes: number; km: number };

/**
 * A rough door-to-door time with no routing API: walking (4.8 km/h, streets ~30%
 * longer than a straight line) up to 1.5 km, otherwise transit or a taxi at about
 * 22 km/h plus 8 minutes of waiting and walking to the stop.
 */
export function estimateTravel(from: Coords, to: Coords): TravelEstimate {
  const km = distanceKm(from, to);
  if (km <= 1.5) return { mode: "walk", km, minutes: Math.max(1, Math.round(((km * 1.3) / 4.8) * 60)) };
  return { mode: "transit", km, minutes: Math.round(8 + ((km * 1.3) / 22) * 60) };
}

export const hasCoords = <T extends { latitude?: number; longitude?: number }>(p: T | undefined): p is T & Coords =>
  p?.latitude != null && p.longitude != null;

/** "Leave by" for the next stop: its start time minus the travel time. */
export function leaveBy(next: TodayStop, travelMinutes: number) {
  const start = toMinutes(next.startTime);
  return start == null ? undefined : fromMinutes(start - travelMinutes);
}

/* ---------- Hourly weather (Open-Meteo, free, no key) ---------- */

export type HourWeather = { time: string; temp: number; rainChance: number; emoji: string; label: string; kind: WeatherKind };
export type LiveWeather = { now: { temp: number; emoji: string; label: string; kind: WeatherKind }; hours: HourWeather[] };

/** Current conditions and the next `hours` hours, in the place's own time zone. */
export function hourlyForecastUrl(latitude: number, longitude: number, hours = 12) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(3),
    longitude: longitude.toFixed(3),
    current: "temperature_2m,weather_code",
    hourly: "temperature_2m,weather_code,precipitation_probability",
    forecast_hours: String(hours),
    timezone: "auto",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function parseHourly(json: unknown): LiveWeather | null {
  const j = json as {
    current?: { temperature_2m?: number; weather_code?: number };
    hourly?: { time?: string[]; temperature_2m?: (number | null)[]; weather_code?: (number | null)[]; precipitation_probability?: (number | null)[] };
  };
  const c = j.current;
  if (c?.temperature_2m == null || c.weather_code == null) return null;
  const h = j.hourly ?? {};
  const hours: HourWeather[] = (h.time ?? []).flatMap((t, i) => {
    const code = h.weather_code?.[i];
    const temp = h.temperature_2m?.[i];
    if (code == null || temp == null) return [];
    return [{ time: t.slice(11, 16), temp: Math.round(temp), rainChance: h.precipitation_probability?.[i] ?? 0, ...describeWeather(code) }];
  });
  return { now: { temp: Math.round(c.temperature_2m), ...describeWeather(c.weather_code) }, hours };
}

const WET = new Set(["Drizzle", "Rain", "Storms", "Snow"]);

/** The first of the next `within` hours where rain is likely (or already falling), if any. */
export function rainSoon(weather: LiveWeather | null, within = 3, threshold = 60): HourWeather | undefined {
  return weather?.hours.slice(0, within + 1).find((h) => h.rainChance >= threshold || (WET.has(h.label) && h.rainChance >= 40));
}

/* ---------- When to offer a re-plan ---------- */

const OUTDOOR_SUBS = new Set(["park", "beach", "hike", "garden", "viewpoint", "landmark", "temple", "tour", "market", "walk"]);
const INDOOR_SUBS = new Set(["museum", "mall", "show", "club", "bar", "live-music"]);

/** True for stops that are mostly outside: parks, viewpoints, temples, markets, tours. */
export function isOutdoor(stop: Pick<TodayStop, "category" | "subcategory">) {
  if (stop.subcategory && INDOOR_SUBS.has(stop.subcategory)) return false;
  if (stop.subcategory && OUTDOOR_SUBS.has(stop.subcategory)) return true;
  return stop.category === "nature" || stop.category === "sightseeing";
}

export type TodayAlert =
  | { kind: "late"; minutes: number; reason: string }
  | { kind: "rain"; at: string; chance: number; outdoor: string[]; reason: string };

/** Running at least this many minutes behind offers a re-plan. */
export const LATE_AFTER = 20;

/**
 * What to warn about right now, most urgent first, each with the reason text the
 * AI re-plan gets. Rain only counts when an open stop ahead is outdoors.
 */
export function todayAlerts(status: TodayStatus<TodayStop>, weather: LiveWeather | null, now: number): TodayAlert[] {
  const alerts: TodayAlert[] = [];
  const clock = fromMinutes(now);
  const rain = rainSoon(weather);
  const ahead = [status.next, ...status.later].filter((s): s is TodayStop => !!s);
  const outdoor = ahead.filter(isOutdoor).map((s) => s.title);
  if (rain && outdoor.length > 0) {
    alerts.push({
      kind: "rain",
      at: rain.time,
      chance: rain.rainChance,
      outdoor,
      reason: `It's ${clock} now and rain is likely from about ${rain.time} (${rain.rainChance}%). Swap the outdoor stops still ahead (${outdoor.join(", ")}) for indoor or covered places nearby, or move them before the rain. Keep everything already done as it is.`,
    });
  }
  if (status.behindBy >= LATE_AFTER) {
    alerts.push({
      kind: "late",
      minutes: status.behindBy,
      reason: `We're running about ${status.behindBy} minutes behind. It's ${clock} now. Re-plan the rest of today from now: reorder the remaining stops to cut travel, shorten or drop the least important ones, and keep reservations and meals. Keep everything already done as it is.`,
    });
  }
  return alerts;
}

/* ---------- Ahead-of-time schedule (home screen widget) ---------- */

export type ProjectedStatus<S extends TodayStop> = { at: number; status: TodayStatus<S> };

/**
 * How the day will look over time if the traveler keeps to the plan, for
 * surfaces that can't run app code later (the iOS widget's timeline): the real
 * status at `now`, then a step when each open stop starts and one when it ends
 * (counted as done from then on). It stops at a stop without a start time, or
 * at one that's already overdue, because only the app knows when that changes.
 */
export function projectDay<S extends TodayStop>(stops: S[], now: number, maxSteps = 40): ProjectedStatus<S>[] {
  const steps: ProjectedStatus<S>[] = [{ at: now, status: todayStatus(stops, now) }];
  let assumed = stops;
  for (const s of stops) {
    if (s.isCompleted) continue;
    const start = toMinutes(s.startTime);
    if (start == null) break;
    const end = start + (s.durationMinutes ?? 60);
    if (end <= now) break;
    if (start > now) steps.push({ at: start, status: todayStatus(assumed, start) });
    assumed = assumed.map((a) => (a._id === s._id ? { ...a, isCompleted: true } : a));
    if (end < 24 * 60) steps.push({ at: end, status: todayStatus(assumed, end) });
    if (steps.length >= maxSteps) break;
  }
  return steps.slice(0, maxSteps);
}
