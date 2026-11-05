import type { TripDetails } from "@trip/backend/types";
import type { I18n } from "@trip/i18n/react";
import { estimateTravel, findTodayDay, hasCoords, leaveBy, localToday, projectDay, todayStatus, toMinutes, type TodayStatus } from "@trip/ui";
import type { NextStopActivityProps, NextStopProps } from "@/widgets/types";

/**
 * Builds what the "Next stop" widget and the travel-day Live Activity show, from
 * the same Today-mode helpers the app uses. Pure, so the widget timeline can be
 * planned ahead for the hours the app isn't open.
 */

type Day = TripDetails["subTrips"][number];
type Stop = Day["activities"][number];
type Text = Pick<I18n, "t" | "f">;
/** The fields of a trip that the list query returns too. */
export type TripSummary = { _id: string; title: string; destination: string; startDate: string; endDate: string };

const SCHEME = "tripplanner://";
export const todayUrl = (tripId: string) => `${SCHEME}trips/${tripId}/today`;

/** A local "YYYY-MM-DD" plus minutes since midnight, as a Date. */
export function atMinutes(date: string, minutes: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 0, minutes);
}

export function addDays(date: string, n: number) {
  const d = atMinutes(date, 0);
  d.setDate(d.getDate() + n);
  return localToday(d);
}

const SYMBOLS: Record<string, string> = {
  sightseeing: "building.columns.fill",
  food: "fork.knife",
  lodging: "bed.double.fill",
  transport: "tram.fill",
  shopping: "bag.fill",
  nightlife: "moon.stars.fill",
  nature: "leaf.fill",
  flight: "airplane",
  train: "tram.fill",
  bus: "bus.fill",
  car: "car.fill",
  cafe: "cup.and.saucer.fill",
  museum: "building.columns.fill",
  viewpoint: "binoculars.fill",
};
const symbolFor = (s?: Stop) => (s && (SYMBOLS[s.subcategory ?? ""] ?? SYMBOLS[s.category ?? ""])) || "mappin.circle.fill";

const blank = (trip: TripSummary | null, url: string) => ({
  time: "",
  trip: trip?.title ?? "",
  progress: "",
  done: 0,
  total: 0,
  then: "",
  url,
  directionsUrl: "",
  directionsLabel: "",
});

/** No trip on this date: the next trip's countdown, or a hint. */
export function idleProps(text: Text, next: TripSummary | null, date: string): NextStopProps {
  const { t } = text;
  const days = next ? Math.round((atMinutes(next.startDate, 0).getTime() - atMinutes(date, 0).getTime()) / 86_400_000) : 0;
  return {
    ...blank(next, next ? `${SCHEME}trips/${next._id}` : SCHEME),
    state: "idle",
    eyebrow: next ? t("widget.nextTrip") : "Trip Planner",
    title: next && days > 0 ? t("today.startsIn", { title: next.title, count: days }) : t("widget.noTrip"),
    detail: next ? next.destination : t("widget.noTripBody"),
    symbol: next ? "suitcase.rolling.fill" : "map.fill",
  };
}

/** One moment of a trip day: the stop to head to, or the wrap-up once it's all done. */
export function dayProps(text: Text, trip: TripSummary, day: Day, status: TodayStatus<Stop>): NextStopProps {
  const { t, f } = text;
  const url = todayUrl(trip._id);
  const base = {
    ...blank(trip, url),
    trip: t("upNext.tripDay", { trip: trip.title, day: day.dayNumber }),
    progress: t("today.doneCount", { done: status.done, total: status.total }),
    done: status.done,
    total: status.total,
  };
  const stop = status.current ?? status.next;
  if (!stop) {
    return {
      ...base,
      state: "done",
      eyebrow: t("today.title"),
      title: t("today.wrapTitle"),
      detail: t("today.wrapBody", { count: status.total }),
      symbol: "checkmark.circle.fill",
    };
  }

  const from = hasCoords(status.lastDone) ? status.lastDone : null;
  const leave = !status.current && from && hasCoords(stop) ? leaveBy(stop, estimateTravel(from, stop).minutes) : undefined;
  const after = status.later[0];
  return {
    ...base,
    state: "stop",
    eyebrow: status.current ? t("today.happeningNow") : t("today.upNext"),
    title: stop.title,
    time: stop.startTime ? f.time(stop.startTime) : "",
    detail: leave ? t("today.leaveBy", { time: f.time(leave) }) : stop.address,
    then: after ? (after.startTime ? t("widget.thenAt", { title: after.title, time: f.time(after.startTime) }) : t("widget.then", { title: after.title })) : "",
    directionsUrl: `${url}?go=${stop._id}`,
    directionsLabel: t("upNext.directions"),
    symbol: symbolFor(stop),
  };
}

/** The Live Activity's content at `now`: the widget's, plus a countdown to the next change. */
export function activityProps(text: Text, trip: TripSummary, day: Day, date: string, status: TodayStatus<Stop>, now: number): NextStopActivityProps {
  const props = dayProps(text, trip, day, status);
  const stop = status.current ?? status.next;
  const start = toMinutes(stop?.startTime);
  const target = start == null ? undefined : status.current ? start + (stop?.durationMinutes ?? 60) : start;
  const counting = target != null && target > now;
  return {
    ...props,
    untilMs: counting ? atMinutes(date, target).getTime() : 0,
    sinceMs: atMinutes(date, now).getTime(),
    untilLabel: status.current ? text.t("widget.endsIn") : text.t("widget.startsIn"),
  };
}

/** When the Live Activity's content goes out of date: the countdown's end, or in an hour. */
export function activityStaleDate(props: NextStopActivityProps) {
  return new Date(props.untilMs || Date.now() + 60 * 60_000);
}

export type TimelineEntry = { date: Date; props: NextStopProps };

/**
 * The widget's timeline from `now` through tomorrow: each step of today as
 * planned, then tomorrow from midnight. `details` are the full trips the app
 * has loaded (the one under way, and the one starting tomorrow if any).
 */
export function widgetTimeline(text: Text, trips: TripSummary[], details: TripDetails[], now: Date): TimelineEntry[] {
  const today = localToday(now);
  const entries: TimelineEntry[] = [];
  for (const [offset, date] of [today, addDays(today, 1)].entries()) {
    const from = offset === 0 ? now.getHours() * 60 + now.getMinutes() : 0;
    const trip = trips.find((t) => t.startDate <= date && t.endDate >= date);
    const full = trip && details.find((d) => d._id === trip._id);
    const day = full ? findTodayDay(full, date) : undefined;
    if (trip && full && day) {
      for (const step of projectDay(day.activities, from)) {
        entries.push({ date: atMinutes(date, step.at), props: dayProps(text, trip, day, step.status) });
      }
    } else if (!trip) {
      // A trip day whose details haven't loaded yet is skipped.
      const next = trips.find((t) => t.startDate > date) ?? null;
      entries.push({ date: atMinutes(date, from), props: idleProps(text, next, date) });
    }
  }
  return entries;
}

/** The day under way on `date` in a loaded trip, for the Live Activity. */
export function liveDay(trip: TripDetails | undefined | null, date: string, now: number) {
  const day = trip ? findTodayDay(trip, date) : undefined;
  return day ? { day, status: todayStatus(day.activities, now) } : null;
}
