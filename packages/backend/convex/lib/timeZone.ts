/** True for a time zone this runtime knows, like "Asia/Tokyo". */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone.includes("/")) return zone === "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Open-Meteo forecast with `timezone=auto` -> its zone. */
export function timeZoneFromForecast(json: unknown): string | null {
  const zone = (json as { timezone?: unknown } | null)?.timezone;
  return isTimeZone(zone) && zone !== "GMT" ? zone : null;
}

/** Open-Meteo geocoding -> the first hit's zone. */
export function timeZoneFromGeocode(json: unknown): string | null {
  const zone = (json as { results?: { timezone?: unknown }[] } | null)?.results?.[0]?.timezone;
  return isTimeZone(zone) ? zone : null;
}
