"use client";

import { api } from "@trip/backend/api";
import { useI18n } from "@trip/i18n/react";
import { links, localToday } from "@trip/ui";
import { useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { EASE_OUT } from "@/lib/motion";
import { SmartImage } from "./smart-image";
import { useToggleDone } from "./undo-toast";

/**
 * Home-screen hero for the next thing to do: the first open activity of the
 * current (or next) trip, the step inside it, and what comes after. Checking it
 * off slides the next activity in.
 */
export function UpNext() {
  // Read the local date only in the browser: the server render has no "today" for the visitor.
  const today = useSyncExternalStore(noop, localToday, () => null);
  const next = useQuery(api.trips.upNext, today ? { today } : "skip");
  const toggleDone = useToggleDone();
  const reduce = useReducedMotion();
  const { t, f, category } = useI18n();
  if (!next) return null;

  const { trip, day, activity, step, later } = next;
  const badge = category(activity.category, activity.subcategory);
  const pct = day.total ? day.done / day.total : 0;
  const target = step ?? activity;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      aria-label={t("upNext.label")}
      className="relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 text-white shadow-2xl shadow-black/20"
    >
      {/* Backdrop: the trip photo, slowly drifting, under a gradient wash */}
      <motion.div
        className="absolute inset-0 -z-10"
        animate={reduce ? undefined : { scale: [1.05, 1.12, 1.05] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      >
        <SmartImage src={trip.imageUrl} seed={trip.destination} emoji="🌏" tint="#0e7c66" className="h-full w-full" priority />
      </motion.div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-slate-950/95 via-slate-950/80 to-primary/60" />

      <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 uppercase tracking-widest backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
              </span>
              {t("upNext.label")}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">{f.countdown(next.startsInDays, day.dayNumber)}</span>
            <Link href={`/trips/${trip._id}`} className="truncate rounded-full bg-white/10 px-3 py-1 backdrop-blur transition hover:bg-white/20">
              {t("upNext.tripDay", { trip: trip.title, day: day.dayNumber })}
              {day.date ? `, ${f.day(day.date)}` : ""}
            </Link>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activity._id + (step?._id ?? "")}
              initial={{ opacity: 0, x: reduce ? 0 : 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduce ? 0 : -24 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="mt-5"
            >
              <p className="flex flex-wrap items-center gap-2 text-sm text-white/70">
                {activity.startTime && <span className="rounded-md bg-white/15 px-2 py-0.5 font-semibold tabular-nums text-white">{f.time(activity.startTime)}</span>}
                <span>
                  {badge.emoji} {badge.text}
                </span>
                {activity.durationMinutes ? <span>· {f.duration(activity.durationMinutes)}</span> : null}
              </p>
              <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{activity.title}</h2>
              <p className="mt-2 line-clamp-2 max-w-2xl text-white/75">{activity.description}</p>
              {step && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm backdrop-blur">
                  <span className="text-white/60">{t("upNext.nextStep")}</span>
                  <span className="font-semibold">{step.title}</span>
                </p>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex flex-wrap gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => void toggleDone(target, true)}
              className="rounded-full bg-white px-5 py-2.5 font-semibold text-slate-950 shadow-lg transition hover:bg-white/90"
            >
              ✓ {step ? t("upNext.doneWithStep") : t("upNext.markDone")}
            </motion.button>
            <a
              href={links.directions(activity)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-white/15 px-5 py-2.5 font-semibold backdrop-blur transition hover:bg-white/25 active:scale-[0.97]"
            >
              🧭 {t("upNext.directions")}
            </a>
            <Link
              href={`/trips/${trip._id}#day-${day._id}`}
              className="rounded-full px-5 py-2.5 font-semibold text-white/80 transition hover:text-white active:scale-[0.97]"
            >
              {t("upNext.openTrip")} →
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4 md:w-64">
          <DayRing pct={pct} done={day.done} total={day.total} dayNumber={day.dayNumber} />
          {later.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/50">{t("upNext.afterThat")}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                <AnimatePresence initial={false}>
                  {later.map(({ activity: a, dayNumber }, i) => (
                    <motion.li
                      key={a._id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1 - i * 0.25, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25, ease: EASE_OUT }}
                      className="flex items-center gap-2 truncate text-sm"
                    >
                      <span className="w-16 shrink-0 tabular-nums text-white/50">{a.startTime ? f.time(a.startTime) : t("time.dayN", { day: dayNumber })}</span>
                      <span className="truncate font-medium">{a.title}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

const noop = () => () => {};

/** Day progress as a ring that fills as activities are checked off. */
function DayRing({ pct, done, total, dayNumber }: { pct: number; done: number; total: number; dayNumber: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="6" />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#6ee7b7"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.8, ease: EASE_OUT }}
        />
      </svg>
      <div>
        <p className="text-2xl font-extrabold tabular-nums">
          {done}/{total}
        </p>
        <p className="text-xs text-white/60">{t("upNext.doneOnDay", { day: dayNumber })}</p>
      </div>
    </div>
  );
}
