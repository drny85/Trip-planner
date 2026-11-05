/**
 * Daily forecasts from Open-Meteo (free, no key). It forecasts up to 16 days
 * ahead, so days further out get nothing and the apps show nothing.
 */
export type WeatherKind = "clear" | "partlyCloudy" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storms";
/** `label` is English (it's sent to the AI); show `kind` through the translations instead. */
export type DayWeather = { high: number; low: number; rainChance: number; emoji: string; label: string; kind: WeatherKind };

export function forecastUrl(latitude: number, longitude: number, date: string) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(3),
    longitude: longitude.toFixed(3),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    start_date: date,
    end_date: date,
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/** True when Open-Meteo can forecast this date. */
export function inForecastRange(date: string, today: string) {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days >= 0 && days <= 15;
}

/** WMO weather codes to an emoji and a short label. */
export function describeWeather(code: number): { emoji: string; label: string; kind: WeatherKind } {
  if (code === 0) return { emoji: "☀️", label: "Clear", kind: "clear" };
  if (code <= 2) return { emoji: "🌤️", label: "Partly cloudy", kind: "partlyCloudy" };
  if (code === 3) return { emoji: "☁️", label: "Cloudy", kind: "cloudy" };
  if (code <= 48) return { emoji: "🌫️", label: "Fog", kind: "fog" };
  if (code <= 57) return { emoji: "🌦️", label: "Drizzle", kind: "drizzle" };
  if (code <= 67 || (code >= 80 && code <= 82)) return { emoji: "🌧️", label: "Rain", kind: "rain" };
  if (code <= 77 || code === 85 || code === 86) return { emoji: "❄️", label: "Snow", kind: "snow" };
  return { emoji: "⛈️", label: "Storms", kind: "storms" };
}

/** Parses Open-Meteo's daily response for one day. */
export function parseForecast(json: unknown): DayWeather | null {
  const daily = (json as { daily?: Record<string, (number | null)[]> }).daily;
  const code = daily?.weather_code?.[0];
  const high = daily?.temperature_2m_max?.[0];
  const low = daily?.temperature_2m_min?.[0];
  if (code == null || high == null || low == null) return null;
  return { high: Math.round(high), low: Math.round(low), rainChance: daily?.precipitation_probability_max?.[0] ?? 0, ...describeWeather(code) };
}
