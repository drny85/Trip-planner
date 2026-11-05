"use client";

import { hourlyForecastUrl, minutesNow, parseHourly, type Coords, type LiveWeather } from "@trip/ui";
import { useEffect, useState, useSyncExternalStore } from "react";

/** Minutes since local midnight, ticking every 30 seconds. Null on the server. */
export function useNowMinutes() {
  return useSyncExternalStore(
    (notify) => {
      const id = setInterval(notify, 30_000);
      return () => clearInterval(id);
    },
    () => minutesNow(),
    () => null,
  );
}

/** Current weather and the next 12 hours at `coords`, refreshed every 15 minutes. */
export function useLiveWeather(coords: Coords | null) {
  const [weather, setWeather] = useState<LiveWeather | null>(null);
  const lat = coords?.latitude;
  const lng = coords?.longitude;
  useEffect(() => {
    if (lat == null || lng == null) return;
    const ctrl = new AbortController();
    const load = () =>
      fetch(hourlyForecastUrl(lat, lng), { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => json && setWeather(parseHourly(json)))
        .catch(() => undefined);
    void load();
    const id = setInterval(load, 15 * 60_000);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, [lat, lng]);
  return weather;
}

type LocationState = { status: "off" | "asking" | "denied" | "unavailable" } | { status: "on"; coords: Coords };

/**
 * The traveler's position, for "how long to get there". Starts on its own when
 * the browser already allows it; otherwise waits for `enable()` (a button tap).
 */
export function useMyLocation() {
  const [state, setState] = useState<LocationState>({ status: "off" });
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => !cancelled && p.state === "granted" && setWatching(true))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!watching || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setState({ status: "on", coords: { latitude: p.coords.latitude, longitude: p.coords.longitude } }),
      (e) => setState({ status: e.code === e.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [watching]);

  return {
    ...state,
    enable: () => {
      setState({ status: "geolocation" in navigator ? "asking" : "unavailable" });
      setWatching(true);
    },
  };
}
