"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import type { ActivityNode, TripDetails } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import {
  cn,
  distanceKm,
  estimateTravel,
  findTodayDay,
  fromMinutes,
  hasCoords,
  leaveBy,
  links,
  localToday,
  todayAlerts,
  todayStatus,
  type Coords,
  type LiveWeather,
  type TodayAlert,
} from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { SmartImage } from "@/components/smart-image";
import { ReplanDialog } from "@/components/trip/replan-day";
import { useToggleDone } from "@/components/undo-toast";
import { EASE_OUT, layoutSpring, rise } from "@/lib/motion";
import { useLiveWeather, useMyLocation, useNowMinutes } from "./hooks";

type Day = TripDetails["subTrips"][number];
/** Farther than this from the next stop, your position isn't useful for a travel time (you're not there yet). */
const FAR_KM = 30;

/**
 * Live "today" mode: on a travel day, what's next, how long it takes to get
 * there, the weather for the next hours, and a one-tap re-plan when you're
 * running late or rain is coming. `previewDay` shows any day as if it were today.
 */
export function TodayView({ tripId, previewDay }: { tripId: Id<"trips">; previewDay?: number }) {
  const trip = useQuery(api.trips.get, { tripId });
  const today = useSyncExternalStore(noop, localToday, () => null);
  const { t } = useI18n();
  if (trip === undefined || !today) return <TodaySkeleton />;
  if (trip === null) return <p className="p-8 text-center text-muted-foreground">{t("trip.notFound")}</p>;

  const preview = previewDay != null ? trip.subTrips.find((d) => d.dayNumber === previewDay) : undefined;
  const day = preview ?? findTodayDay(trip, today);
  if (!day) return <NotToday trip={trip} today={today} />;
  return <Today key={day._id} trip={trip} day={day} isPreview={!!preview && preview !== findTodayDay(trip, today)} />;
}

function Today({ trip, day, isPreview }: { trip: TripDetails; day: Day; isPreview: boolean }) {
  const now = useNowMinutes() ?? 0;
  const { t, f } = useI18n();
  const status = todayStatus(day.activities, now);
  const { next, later, lastDone } = status;
  const canEdit = trip.myRole === "owner";

  const weatherAt = (hasCoords(next) ? next : day.activities.find((a) => hasCoords(a))) as Coords | undefined;
  const weather = useLiveWeather(weatherAt ?? null);
  const location = useMyLocation();
  const alerts = todayAlerts(status, weather, now);
  const [replan, setReplan] = useState<TodayAlert | "custom" | null>(null);

  // Travel time to the next stop: from you when you're nearby, otherwise from the last stop you finished.
  const me = location.status === "on" ? location.coords : null;
  const meNear = me && hasCoords(next) && distanceKm(me, next) <= FAR_KM ? me : null;
  const from = meNear ?? (hasCoords(lastDone) ? lastDone : null);
  const travel = from && hasCoords(next) ? estimateTravel(from, next) : null;

  const dayWeather = weather?.hours.length
    ? { label: weather.now.label, high: Math.max(...weather.hours.map((h) => h.temp)), low: Math.min(...weather.hours.map((h) => h.temp)), rainChance: Math.max(...weather.hours.map((h) => h.rainChance)) }
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <motion.header {...rise(0)} className="flex flex-wrap items-center gap-3">
        <Link href={`/trips/${trip._id}#day-${day._id}`} className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
          ← {trip.title}
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          {isPreview ? t("today.preview") : t("today.title")}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("time.dayN", { day: day.dayNumber })}
          {day.date ? ` · ${f.weekday(day.date)}` : ""}
          {day.location ? ` · ${day.location}` : ""} · {f.time(fromMinutes(now))}
        </span>
      </motion.header>

      <WeatherStrip weather={weather} />

      <AnimatePresence initial={false}>
        {alerts.map((a) => (
          <AlertCard key={a.kind} alert={a} day={day} canEdit={canEdit} onReplan={() => setReplan(a)} />
        ))}
      </AnimatePresence>

      {next ? (
        <NextCard
          key={next._id}
          stop={next}
          isNow={status.current?._id === next._id}
          travel={travel}
          travelFrom={meNear ? t("today.fromYou") : lastDone ? t("today.fromPlace", { place: lastDone.title }) : undefined}
          location={location}
          far={!!me && !meNear}
        />
      ) : (
        <motion.section {...rise(1)} className="mt-6 rounded-3xl border border-border bg-card p-8 text-center">
          <p className="text-5xl">🎉</p>
          <h2 className="mt-3 text-2xl font-bold">{t("today.wrapTitle")}</h2>
          <p className="mt-1 text-muted-foreground">
            {t("today.wrapBody", { count: status.total })} {trip.subTrips.some((d) => d.dayNumber === day.dayNumber + 1) ? t("today.restUpTomorrow") : t("today.whatATrip")}
          </p>
        </motion.section>
      )}

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-bold">{t("today.restOfDay")}</h3>
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("today.doneCount", { done: status.done, total: status.total })}
          </p>
        </div>
        <ol className="mt-3 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {day.activities.map((a, i) => {
              const prev = day.activities[i - 1];
              const leg = i > 0 && hasCoords(prev) && hasCoords(a) ? estimateTravel(prev, a) : null;
              return <TimelineRow key={a._id} stop={a} leg={leg} isNext={a._id === next?._id} isLater={later.includes(a)} />;
            })}
          </AnimatePresence>
        </ol>
        {canEdit && day.activities.some((a) => !a.isCompleted) && (
          <button onClick={() => setReplan("custom")} className="mt-4 w-full rounded-full bg-muted py-2.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
            ✨ {t("today.replanRest")}
          </button>
        )}
      </section>

      <AnimatePresence>
        {replan && (
          <ReplanDialog
            key="replan"
            day={day}
            weather={dayWeather ? { ...dayWeather, emoji: weather!.now.emoji, kind: weather!.now.kind } : null}
            rainy={replan !== "custom" && replan.kind === "rain"}
            now={fromMinutes(now)}
            initialReason={replan === "custom" ? undefined : replan.reason}
            onClose={() => setReplan(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function WeatherStrip({ weather }: { weather: LiveWeather | null }) {
  const { t, f } = useI18n();
  if (!weather) return null;
  return (
    <motion.section {...rise(1)} aria-label={t("today.weather")} className="mt-5 flex items-center gap-4 overflow-x-auto rounded-3xl border border-border bg-card p-4 [scrollbar-width:none]">
      <div className="flex shrink-0 items-center gap-2 pr-2">
        <span className="text-3xl" aria-hidden>
          {weather.now.emoji}
        </span>
        <div>
          <p className="text-2xl font-extrabold tabular-nums leading-none">{weather.now.temp}°</p>
          <p className="text-xs text-muted-foreground">{t(`weather.${weather.now.kind}`)}</p>
        </div>
      </div>
      <ul className="flex gap-1.5">
        {weather.hours.slice(1, 9).map((h) => (
          <li
            key={h.time}
            title={t("replan.rainChanceTitle", { label: t(`weather.${h.kind}`), percent: h.rainChance })}
            className={cn("flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-2xl py-2 text-xs", h.rainChance >= 50 ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-muted/60")}
          >
            <span className="text-muted-foreground">{f.time(h.time).replace(":00", "")}</span>
            <span aria-hidden>{h.emoji}</span>
            <span className="font-semibold tabular-nums">{h.temp}°</span>
            {h.rainChance >= 30 && <span className="tabular-nums">☂ {h.rainChance}%</span>}
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

function AlertCard({ alert, day, canEdit, onReplan }: { alert: TodayAlert; day: Day; canEdit: boolean; onReplan: () => void }) {
  const shift = useMutation(api.activities.shiftTimes);
  const [shifted, setShifted] = useState<number | null>(null);
  const { t, f } = useI18n();
  const rain = alert.kind === "rain";
  // Round the delay up to the next 15 minutes for "push everything back".
  const push = alert.kind === "late" ? Math.min(180, Math.ceil(alert.minutes / 15) * 15) : 0;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      role="alert"
      className={cn("mt-4 rounded-3xl p-5", rain ? "bg-sky-500/10 ring-1 ring-sky-500/30" : "bg-amber-500/10 ring-1 ring-amber-500/30")}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          {rain ? "🌧️" : "⏰"}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">{rain ? t("today.rainFrom", { time: f.time(alert.at), percent: alert.chance }) : t("today.behind", { duration: f.duration(alert.minutes) })}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{rain ? outdoorText(t, alert.outdoor) : t("today.lateBody")}</p>
          {canEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={onReplan}
                className={cn("rounded-full px-4 py-2 text-sm font-semibold text-white shadow-md transition active:scale-[0.97]", rain ? "bg-sky-600 shadow-sky-600/25 hover:bg-sky-700" : "bg-amber-600 shadow-amber-600/25 hover:bg-amber-700")}
              >
                ✨ {rain ? t("today.swapIndoor") : t("today.replanFromNow")}
              </button>
              {alert.kind === "late" &&
                (shifted ? (
                  <button
                    onClick={async () => {
                      await shift({ subTripId: day._id, minutes: -shifted });
                      setShifted(null);
                    }}
                    className="rounded-full bg-card px-4 py-2 text-sm font-semibold ring-1 ring-border"
                  >
                    {t("today.movedUndo", { minutes: shifted })}
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await shift({ subTripId: day._id, minutes: push });
                      setShifted(push);
                    }}
                    className="rounded-full bg-card px-4 py-2 text-sm font-semibold ring-1 ring-border transition hover:bg-muted active:scale-[0.97]"
                  >
                    {t("today.pushBack", { minutes: push })}
                  </button>
                ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">{t("today.organizerCan")}</p>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function NextCard({
  stop,
  isNow,
  travel,
  travelFrom,
  location,
  far,
}: {
  stop: ActivityNode;
  isNow: boolean;
  travel: ReturnType<typeof estimateTravel> | null;
  travelFrom?: string;
  location: ReturnType<typeof useMyLocation>;
  far: boolean;
}) {
  const toggleDone = useToggleDone();
  const { t, f, category } = useI18n();
  const badge = category(stop.category, stop.subcategory);
  const leave = travel && !isNow ? leaveBy(stop, travel.minutes) : undefined;
  const step = stop.children.find((c) => !c.isCompleted);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="relative isolate mt-6 overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-2xl shadow-black/20"
    >
      <SmartImage src={stop.photoUrl} seed={stop.title} emoji={badge.emoji} tint={badge.color} className="absolute inset-0 -z-10 h-full w-full" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/30" />
      <div className="p-6 pt-24 sm:p-8 sm:pt-32">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">{isNow ? t("today.happeningNow") : t("today.upNext")}</p>
        <h2 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{stop.title}</h2>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/75">
          {stop.startTime && <span className="rounded-md bg-white/15 px-2 py-0.5 font-semibold tabular-nums text-white">{f.time(stop.startTime)}</span>}
          <span>
            {badge.emoji} {badge.text}
          </span>
          {stop.durationMinutes ? <span>· {f.duration(stop.durationMinutes)}</span> : null}
          {stop.address && <span className="truncate">· {stop.address}</span>}
        </p>
        {step && <p className="mt-3 inline-flex rounded-2xl bg-white/10 px-3 py-2 text-sm backdrop-blur">{t("today.nextStep")} <span className="ml-1 font-semibold">{step.title}</span></p>}

        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          {travel ? (
            <span className="rounded-2xl bg-white/10 px-3 py-2 backdrop-blur">
              {travel.mode === "walk" ? "🚶" : "🚇"} {t(travel.mode === "walk" ? "today.travelWalk" : "today.travelTransit", { duration: f.duration(travel.minutes) })}
              {travelFrom ? <span className="text-white/60"> {travelFrom}</span> : null}
              {leave && <span className="ml-2 font-semibold text-emerald-300">{t("today.leaveBy", { time: f.time(leave) })}</span>}
            </span>
          ) : null}
          {location.status !== "on" && (
            <button
              onClick={location.enable}
              disabled={location.status === "asking"}
              className="rounded-2xl bg-white/10 px-3 py-2 font-semibold backdrop-blur transition hover:bg-white/20 disabled:opacity-60"
            >
              📍 {location.status === "denied" ? t("today.locationBlockedWeb") : location.status === "unavailable" ? t("today.locationUnavailable") : t("today.useLocation")}
            </button>
          )}
          {far && <span className="text-white/60">{t("today.far", { km: FAR_KM })}</span>}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => void toggleDone(step ?? stop, true)} className="rounded-full bg-white px-5 py-2.5 font-semibold text-slate-950 shadow-lg transition hover:bg-white/90">
            ✓ {step ? t("upNext.doneWithStep") : t("upNext.markDone")}
          </motion.button>
          <a href={links.directions(stop)} target="_blank" rel="noreferrer" className="rounded-full bg-white/15 px-5 py-2.5 font-semibold backdrop-blur transition hover:bg-white/25 active:scale-[0.97]">
            🧭 {t("activity.directions")}
          </a>
          {stop.phone && (
            <a href={links.phone(stop.phone)} className="rounded-full bg-white/15 px-5 py-2.5 font-semibold backdrop-blur transition hover:bg-white/25 active:scale-[0.97]">
              📞 {t("activity.call")}
            </a>
          )}
          {stop.bookingUrl && (
            <a href={stop.bookingUrl} target="_blank" rel="noreferrer" className="rounded-full bg-white/15 px-5 py-2.5 font-semibold backdrop-blur transition hover:bg-white/25 active:scale-[0.97]">
              🎟️ {t("activity.reserve")}
            </a>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function TimelineRow({ stop, leg, isNext, isLater }: { stop: ActivityNode; leg: ReturnType<typeof estimateTravel> | null; isNext: boolean; isLater: boolean }) {
  const toggleDone = useToggleDone();
  const { t, f, category } = useI18n();
  const badge = category(stop.category, stop.subcategory);
  return (
    <motion.li layout transition={layoutSpring} className="flex flex-col">
      {leg && (
        <span className="ml-[3.25rem] py-1 text-xs text-muted-foreground">
          {leg.mode === "walk" ? "🚶" : "🚇"} ~{f.duration(leg.minutes)}
        </span>
      )}
      <div className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors", isNext ? "border-primary/40 bg-primary/5" : "border-border bg-card", stop.isCompleted && "opacity-60")}>
        <button
          onClick={() => void toggleDone(stop, !stop.isCompleted)}
          aria-label={t(stop.isCompleted ? "activity.markNotDone" : "activity.markDone", { title: stop.title })}
          className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold transition", stop.isCompleted ? "border-success bg-success text-white" : "border-border hover:border-primary")}
        >
          {stop.isCompleted ? "✓" : ""}
        </button>
        <span className="w-16 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{f.time(stop.startTime)}</span>
        <span className={cn("flex-1 truncate font-semibold", stop.isCompleted && "line-through")}>
          {badge.emoji} {stop.title}
        </span>
        {isNext && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{t("today.next")}</span>}
        {isLater && stop.durationMinutes ? <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{f.duration(stop.durationMinutes)}</span> : null}
      </div>
    </motion.li>
  );
}

function NotToday({ trip, today }: { trip: TripDetails; today: string }) {
  const startsIn = Math.round((Date.parse(`${trip.startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const over = today > trip.endDate;
  const { t } = useI18n();
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
      <span className="text-5xl">{over ? "🧳" : "🗓️"}</span>
      <h1 className="text-2xl font-bold">{over ? t("today.tripOver") : t("today.startsIn", { title: trip.title, count: startsIn })}</h1>
      <p className="text-muted-foreground">{t("today.notTodayBody")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {trip.subTrips.slice(0, 7).map((d) => (
          <Link key={d._id} href={`/trips/${trip._id}/today?day=${d.dayNumber}`} className="rounded-full bg-muted px-4 py-2 text-sm font-semibold transition hover:bg-primary hover:text-primary-foreground">
            {t("today.previewDay", { day: d.dayNumber })}
          </Link>
        ))}
      </div>
      <Link href={`/trips/${trip._id}`} className="text-sm font-semibold text-primary">
        {t("today.backToTrip")}
      </Link>
    </main>
  );
}

function TodaySkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse px-4 pt-6">
      <div className="h-8 w-64 rounded-full bg-muted" />
      <div className="mt-5 h-24 rounded-3xl bg-muted" />
      <div className="mt-6 h-80 rounded-[2rem] bg-muted" />
    </div>
  );
}

const noop = () => () => {};

/** "Park, Garden and more are outdoors." */
function outdoorText(t: ReturnType<typeof useI18n>["t"], places: string[]) {
  const listed = places.slice(0, 3).join(", ");
  return t("today.outdoors", { count: places.length, places: places.length > 3 ? t("today.andMore", { places: listed }) : listed });
}

/** True while `today` falls inside the trip, for the "Today" entry points. */
export const isUnderWay = (trip: { startDate: string; endDate: string }, today: string) => today >= trip.startDate && today <= trip.endDate;
