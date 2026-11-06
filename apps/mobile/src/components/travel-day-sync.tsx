import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { localToday } from "@trip/ui";
import type { LiveActivityDismissalPolicy } from "expo-widgets";
import { useEffect, useRef } from "react";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { activityProps, activityStaleDate, addDays, liveDay, widgetTimeline, type TripSummary } from "@/lib/travel-day";
import { useNowMinutes } from "@/screens/today/hooks";
import { nativeWidgets } from "@/widgets";

/** Same as expo-widgets' after(date), without loading the module on builds that lack it. */
const lingerHalfAnHour = (): LiveActivityDismissalPolicy => ({ after: new Date(Date.now() + 30 * 60_000) });

const onDate = (date: string) => (t: TripSummary) => t.startDate <= date && t.endDate >= date;

/**
 * Keeps the iOS "Next stop" widget and a running travel-day Live Activity in
 * step with the trips, while the app is open: on every change to the itinerary,
 * on each stop's start and end, and when the language changes. The widget also
 * gets the rest of today and tomorrow planned ahead, so it moves on by itself.
 */
export function TravelDaySync() {
  return nativeWidgets() ? <Sync /> : null;
}

function Sync() {
  const native = nativeWidgets()!;
  const i18n = useI18n();
  const now = useNowMinutes();
  const today = localToday();
  const tomorrow = addDays(today, 1);

  const trips = useCachedQuery(api.trips.list, {}).data;
  const current = trips?.find(onDate(today));
  const upcoming = trips?.find(onDate(tomorrow));
  const currentTrip = useCachedQuery(api.trips.get, current ? { tripId: current._id as Id<"trips"> } : "skip").data;
  const upcomingTrip = useCachedQuery(api.trips.get, upcoming && upcoming._id !== current?._id ? { tripId: upcoming._id as Id<"trips"> } : "skip").data;

  const lastWidget = useRef("");
  const lastActivity = useRef("");

  useEffect(() => {
    if (!trips) return;
    const details = [currentTrip, upcomingTrip].filter((d) => !!d);
    const entries = widgetTimeline(i18n, trips, details, new Date());
    // The first entry's time moves every tick; only push when what's shown changes.
    const sig = JSON.stringify([i18n.locale, entries.map((e) => e.props), entries.slice(1).map((e) => e.date.getTime())]);
    if (entries.length && sig !== lastWidget.current) {
      lastWidget.current = sig;
      try {
        native.widget.updateTimeline(entries);
      } catch {
        lastWidget.current = "";
      }
    }
  }, [native, i18n, trips, currentTrip, upcomingTrip, now]);

  useEffect(() => {
    const running = native.activity.getInstances();
    if (!running.length || trips === undefined || (current && currentTrip === undefined)) return;
    const live = current && currentTrip ? liveDay(currentTrip, today, now) : null;
    if (!live) {
      // The travel day is over (or the trip is gone): take it off the Lock Screen.
      lastActivity.current = "";
      for (const a of running) void a.end("immediate").catch(() => undefined);
      return;
    }
    const props = activityProps(i18n, current!, live.day, today, live.status, now);
    const { sinceMs: _since, ...shown } = props;
    const sig = JSON.stringify(shown);
    if (sig === lastActivity.current) return;
    lastActivity.current = sig;
    for (const a of running) {
      if (props.state === "done") void a.end(lingerHalfAnHour(), props).catch(() => undefined);
      else void a.update(props, activityStaleDate(props)).catch(() => undefined);
    }
  }, [native, i18n, trips, current, currentTrip, today, now]);

  return null;
}
