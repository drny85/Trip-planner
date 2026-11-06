import type { TripDetails } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { localToday, minutesNow, todayStatus } from "@trip/ui";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { activityProps, activityStaleDate, todayUrl } from "@/lib/travel-day";
import { nativeWidgets } from "@/widgets";

type Day = TripDetails["subTrips"][number];

/**
 * Start and stop the travel-day Live Activity from Today mode. While it runs,
 * TravelDaySync keeps it up to date. `supported` is false off iOS and on builds
 * without the widget extension.
 */
export function useTravelDayActivity(trip: TripDetails, day: Day) {
  const native = nativeWidgets();
  const i18n = useI18n();
  const count = useCallback(() => native?.activity.getInstances().length ?? 0, [native]);
  const [running, setRunning] = useState(() => count() > 0);
  const [error, setError] = useState(false);

  // It can also be ended from the Lock Screen, so check again when the app comes back.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && setRunning(count() > 0));
    return () => sub.remove();
  }, [count]);

  const stop = async () => {
    for (const a of native?.activity.getInstances() ?? []) await a.end("immediate").catch(() => undefined);
    setRunning(false);
  };

  const start = () => {
    if (!native) return;
    const now = minutesNow();
    const props = activityProps(i18n, trip, day, localToday(), todayStatus(day.activities, now), now);
    try {
      // One at a time: replace any activity left from another trip or day.
      for (const a of native.activity.getInstances()) void a.end("immediate").catch(() => undefined);
      native.activity.start(props, todayUrl(trip._id), activityStaleDate(props));
      setError(false);
      setRunning(true);
    } catch {
      // Live Activities are switched off for the app in Settings, or the system refused.
      setError(true);
    }
  };

  return { supported: !!native, running, error, start, stop };
}
