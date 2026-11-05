import { distanceKm, hourlyForecastUrl, minutesNow, parseHourly, type Coords, type LiveWeather } from "@trip/ui";
import * as Location from "expo-location";
import { useEffect, useState } from "react";

/** Minutes since local midnight, ticking every 30 seconds. */
export function useNowMinutes() {
  const [now, setNow] = useState(minutesNow);
  useEffect(() => {
    const id = setInterval(() => setNow(minutesNow()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Current weather and the next 12 hours at `coords` (Open-Meteo), refreshed every 15 minutes. */
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
 * The traveler's position while the screen is open, for travel times. Starts by
 * itself when permission was already given; otherwise waits for `enable()`.
 */
export function useMyLocation() {
  const [state, setState] = useState<LocationState>({ status: "off" });
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync()
      .then((p) => !cancelled && p.granted && setWatching(true))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!watching) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    let last: Coords | null = null;
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!granted) return setState({ status: "denied" });
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 30_000 }, (p) => {
        const next = { latitude: p.coords.latitude, longitude: p.coords.longitude };
        // Skip tiny jitter so travel times don't flicker.
        if (last && distanceKm(last, next) < 0.03) return;
        last = next;
        setState({ status: "on", coords: next });
      });
      if (cancelled) sub.remove();
    })().catch(() => !cancelled && setState({ status: "unavailable" }));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [watching]);

  return {
    ...state,
    enable: () => {
      setState({ status: "asking" });
      setWatching(true);
    },
  };
}
