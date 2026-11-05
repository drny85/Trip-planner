"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { toApplyArgs } from "@trip/backend/replan";
import { categoryLabel, cn, formatTime, type DayWeather } from "@trip/ui";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/motion";
import { DayWeatherChip, useDayWeather } from "./day-weather";

type Proposal = FunctionReturnType<typeof api.ai.replanDay>;
type Stop = { _id: string; title: string; latitude?: number; longitude?: number; children?: Stop[] };
export type ReplanDayInput = Day;
type Day = { _id: Id<"subTrips">; dayNumber: number; date?: string; activities: Stop[] };

const REASONS = [
  { label: "🌧️ It's going to rain", text: "It's going to rain, so move us indoors" },
  { label: "😴 Lighter day", text: "We're tired: make it a slower, lighter day" },
  { label: "🍜 More food", text: "Fit in more great local food" },
  { label: "👨‍👩‍👧 Kid friendly", text: "Make it friendly for kids" },
];

/** The day's forecast chip, plus (for the organizer) the "Re-plan with AI" button. */
export function DayExtras({ day, canEdit }: { day: Day; canEdit: boolean }) {
  const weather = useDayWeather(day.date, day.activities);
  const [open, setOpen] = useState(false);
  const rainy = (weather?.rainChance ?? 0) >= 50;
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <DayWeatherChip weather={weather} />
      {canEdit && day.activities.length > 0 && (
        <button
          onClick={() => setOpen(true)}
          title="Re-plan this day with AI"
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-[0.97]",
            rainy ? "bg-sky-500 text-white shadow-md shadow-sky-500/30 hover:bg-sky-600" : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {rainy ? "☔ Rain plan" : "✨"}
          <span className="sr-only"> Re-plan day {day.dayNumber}</span>
        </button>
      )}
      <AnimatePresence>{open && <ReplanDialog key="replan" day={day} weather={weather} rainy={rainy} onClose={() => setOpen(false)} />}</AnimatePresence>
    </div>
  );
}

/**
 * Today mode opens this with `initialReason` and `now`: it asks right away and only
 * re-plans what's still ahead, so a re-plan is one tap plus "Use this plan".
 */
export function ReplanDialog({
  day,
  weather,
  rainy,
  onClose,
  initialReason,
  now,
}: {
  day: Day;
  weather: DayWeather | null;
  rainy: boolean;
  onClose: () => void;
  initialReason?: string;
  now?: string;
}) {
  const replan = useAction(api.ai.replanDay);
  const apply = useMutation(api.activities.applyReplan);
  const [reason, setReason] = useState(initialReason ?? (rainy ? REASONS[0]!.text : ""));
  const [state, setState] = useState<{ status: "idle" | "thinking" | "applying" } | { status: "error"; message: string }>({ status: "idle" });
  const [proposal, setProposal] = useState<Proposal | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const ask = async (why = reason) => {
    setState({ status: "thinking" });
    setProposal(null);
    try {
      setProposal(await replan({ subTripId: day._id, reason: why, now, weather: weather ? { label: weather.label, high: weather.high, low: weather.low, rainChance: weather.rainChance } : undefined }));
      setState({ status: "idle" });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : "Something went wrong" });
    }
  };
  // One tap from today mode: start thinking as soon as the dialog opens.
  const asked = useRef(false);
  useEffect(() => {
    if (!initialReason || asked.current) return;
    asked.current = true;
    void ask(initialReason);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on open
  }, []);
  const keptIds = new Set(proposal?.activities.flatMap((a) => ("keepId" in a ? [a.keepId] : [])));
  const removed = proposal ? day.activities.filter((a) => !keptIds.has(a._id)) : [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal
        aria-labelledby="replan-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl"
      >
        <h2 id="replan-title" className="text-xl font-bold">
          {now ? "Re-plan the rest of today" : `Re-plan day ${day.dayNumber}`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {weather ? `${weather.emoji} ${weather.label}, ${weather.rainChance}% chance of rain. ` : ""}Tell the AI what to change. You&apos;ll see the new plan before anything changes.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button key={r.label} onClick={() => setReason(r.text)} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition-colors", reason === r.text ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
              {r.label}
            </button>
          ))}
        </div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="Or say it your way…" className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        <button
          onClick={() => void ask()}
          disabled={state.status === "thinking" || !reason.trim()}
          className="mt-3 w-full rounded-full bg-primary py-2.5 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:opacity-90 disabled:opacity-50 active:scale-[0.98]"
        >
          {state.status === "thinking" ? "Re-planning…" : proposal ? "Try again" : "✨ Re-plan"}
        </button>
        {state.status === "error" && <p className="mt-3 text-sm text-danger">{state.message}</p>}
        {state.status === "thinking" && (
          <div className="mt-5 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-2xl bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}

        <AnimatePresence>
          {proposal && state.status !== "thinking" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="mt-5">
              <p className="rounded-2xl bg-primary/5 p-3 text-sm">{proposal.summary}</p>
              <ol className="mt-3 flex flex-col gap-1.5">
                {proposal.activities.map((a, i) => {
                  const isNew = !("keepId" in a);
                  const badge = isNew ? categoryLabel(a.category, a.subcategory) : null;
                  return (
                    <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04, duration: 0.2 }} className="flex items-center gap-3 rounded-2xl border border-border px-3 py-2 text-sm">
                      <span className="w-16 shrink-0 font-semibold tabular-nums text-muted-foreground">{formatTime(a.startTime)}</span>
                      <span className="flex-1 truncate font-semibold">{a.title}</span>
                      {isNew ? (
                        <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">New · {badge?.emoji}</span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">Kept</span>
                      )}
                    </motion.li>
                  );
                })}
              </ol>
              {removed.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Removed: {removed.map((r) => r.title).join(", ")}. Stops with photos are never removed.
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <button onClick={onClose} className="flex-1 rounded-full bg-muted py-2.5 font-semibold">
                  Keep my plan
                </button>
                <button
                  disabled={state.status === "applying"}
                  onClick={async () => {
                    setState({ status: "applying" });
                    await apply({ subTripId: day._id, activities: toApplyArgs(proposal) });
                    onClose();
                  }}
                  className="flex-1 rounded-full bg-primary py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {state.status === "applying" ? "Applying…" : "Use this plan"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
