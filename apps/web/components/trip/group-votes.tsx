"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";

/**
 * Group voting on the itinerary: 👍 / 👎 and a top-3 ⭐ on every stop, a "most
 * wanted" board, and (for the organizer) "Build plan from votes", which has the
 * AI rebuild the plan around the group's favorites and shows it before applying.
 */

type Plan = FunctionReturnType<typeof api.groupVotes.buildPlan>;
type Stop = { _id: string; title: string };
type Day = { _id: Id<"subTrips">; dayNumber: number; activities: Stop[] };

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : fallback);

/** 👍 👎 ⭐ under one stop. Hidden on solo trips and for stops that aren't voted on (transport). */
export function VoteBar({ tripId, activityId, title }: { tripId: Id<"trips">; activityId: Id<"activities">; title: string }) {
  const data = useQuery(api.groupVotes.forTrip, { tripId });
  const vote = useMutation(api.groupVotes.vote);
  const setPick = useMutation(api.groupVotes.setPick);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(id);
  }, [error]);

  const mine = data?.byActivity[activityId];
  if (!data || data.memberCount < 2 || !mine) return null;
  const run = (p: Promise<unknown>) => void p.catch((e: unknown) => setError(errorText(e, t("common.somethingWrong"))));
  const pickLabel = mine.myPick ? t("groupVote.rank", { rank: mine.myPick }) : t("groupVote.star");

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <VoteButton on={mine.myVote === "up"} tone="up" label={t("groupVote.likeAria", { title })} onClick={() => run(vote({ activityId, value: mine.myVote === "up" ? null : "up" }))}>
          👍 <span className="tabular-nums">{mine.up}</span>
        </VoteButton>
        <VoteButton on={mine.myVote === "down"} tone="down" label={t("groupVote.dislikeAria", { title })} onClick={() => run(vote({ activityId, value: mine.myVote === "down" ? null : "down" }))}>
          👎 <span className="tabular-nums">{mine.down}</span>
        </VoteButton>
        <VoteButton
          on={Boolean(mine.myPick)}
          tone="pick"
          label={mine.myPick ? t("groupVote.unstarAria", { title }) : t("groupVote.starAria", { title })}
          onClick={() => run(setPick({ activityId, picked: !mine.myPick }))}
        >
          ⭐ {pickLabel}
        </VoteButton>
        {mine.isFirstPick && <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">🏆 {t("groupVote.firstPick")}</span>}
        {mine.votedOut && <span className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">{t("groupVote.votedOut")}</span>}
      </div>
      {mine.voters.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {mine.voters.map((v) => `${v.name} ${v.pick ? `⭐${v.pick}` : v.value === "up" ? "👍" : "👎"}`).join(" · ")}
        </p>
      )}
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mt-1.5 text-xs font-semibold text-danger">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function VoteButton({ on, tone, label, onClick, children }: { on: boolean; tone: "up" | "down" | "pick"; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      draggable={false}
      whileTap={{ scale: 0.9 }}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
        !on && "border-border hover:bg-muted",
        on && tone === "up" && "border-success bg-success text-white",
        on && tone === "down" && "border-danger bg-danger text-white",
        on && tone === "pick" && "border-amber-500 bg-amber-500 text-white",
      )}
    >
      {children}
    </motion.button>
  );
}

/** The "Group picks" section: how voting works, the most wanted stops, and the rebuild button. */
export function GroupVotes({ tripId, subTrips }: { tripId: Id<"trips">; subTrips: Day[] }) {
  const data = useQuery(api.groupVotes.forTrip, { tripId });
  const build = useAction(api.groupVotes.buildPlan);
  const { t, locale } = useI18n();
  const [state, setState] = useState<{ status: "idle" | "building" } | { status: "error"; message: string }>({ status: "idle" });
  const [plan, setPlan] = useState<Plan | null>(null);
  if (!data || data.memberCount < 2) return null;
  const titles = new Map(subTrips.flatMap((d) => d.activities.map((a) => [a._id, a.title] as const)));

  const onBuild = async () => {
    setState({ status: "building" });
    try {
      setPlan(await build({ tripId, language: locale }));
      setState({ status: "idle" });
    } catch (e) {
      setState({ status: "error", message: errorText(e, t("common.somethingWrong")) });
    }
  };

  return (
    <motion.section {...rise(0)} className="mt-10 rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-card to-card p-6 shadow-sm" aria-labelledby="group-votes-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">{t("groupVote.eyebrow")}</p>
          <h2 id="group-votes-title" className="mt-1 text-2xl font-extrabold tracking-tight">
            🗳️ {t("groupVote.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("groupVote.intro")}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <span className="font-semibold">{t("groupVote.votedCount", { count: data.voterCount, total: data.memberCount })}</span>
          <span className="text-muted-foreground">{t("groupVote.picksLeft", { count: data.picksLeft })}</span>
        </div>
      </div>

      {data.ranking.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{t("groupVote.empty")}</p>
      ) : (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("groupVote.mostWanted")}</p>
          <ol className="mt-2 flex flex-col gap-2">
            {data.ranking.slice(0, 5).map((r) => (
              <li key={r.activityId} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-2.5 text-sm shadow-xs">
                <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold", r.rank === 1 ? "bg-amber-500 text-white" : "bg-muted")}>{r.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{titles.get(r.activityId) ?? "…"}</span>
                  {r.tieBrokenBy && <span className="block text-xs text-muted-foreground">⚖️ {t(TIE[r.tieBrokenBy])}</span>}
                </span>
                {r.isFirstPick && <span title={t("groupVote.firstPick")}>🏆</span>}
                <span className="shrink-0 text-muted-foreground">{t("groupVote.tally", { up: r.up, down: r.down })}</span>
                <span className="shrink-0 font-semibold tabular-nums">{t("groupVote.points", { count: r.score })}</span>
              </li>
            ))}
          </ol>
          {data.votedOutCount > 0 && <p className="mt-2 text-xs text-muted-foreground">{t("groupVote.votedOutCount", { count: data.votedOutCount })}</p>}
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">⚖️ {t("groupVote.rules")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {data.isOwner ? (
          <button
            onClick={() => void onBuild()}
            disabled={state.status === "building" || data.voterCount === 0}
            className="rounded-full bg-amber-500 px-5 py-2.5 font-semibold text-white shadow-lg shadow-amber-500/25 transition hover:bg-amber-600 active:scale-[0.97] disabled:opacity-50"
          >
            {state.status === "building" ? t("groupVote.building") : `✨ ${t("groupVote.build")}`}
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">{t("groupVote.ownerOnly")}</p>
        )}
        {state.status === "error" && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.message}
          </p>
        )}
      </div>

      <AnimatePresence>{plan && <PlanDialog key="plan" tripId={tripId} plan={plan} subTrips={subTrips} onClose={() => setPlan(null)} />}</AnimatePresence>
    </motion.section>
  );
}

const TIE = {
  fairness: "groupVote.tieFairness",
  fewerDowns: "groupVote.tieFewerDowns",
  moreSupporters: "groupVote.tieMoreSupporters",
  order: "groupVote.tieOrder",
} as const;

/** True when the plan would leave the itinerary exactly as it is. */
export function planChangesNothing(plan: Plan, subTrips: Day[]) {
  if (plan.dropped.length) return false;
  return plan.days.every((d) => {
    const now = subTrips.find((s) => s._id === d.subTripId)?.activities.map((a) => a._id) ?? [];
    return d.items.length === now.length && d.items.every((i, n) => i.activityId === now[n] && !i.movedFrom);
  });
}

function PlanDialog({ tripId, plan, subTrips, onClose }: { tripId: Id<"trips">; plan: Plan; subTrips: Day[]; onClose: () => void }) {
  const apply = useMutation(api.groupVotes.applyPlan);
  const { t, f } = useI18n();
  const [state, setState] = useState<{ status: "idle" | "applying" } | { status: "error"; message: string }>({ status: "idle" });
  const titles = new Map(subTrips.flatMap((d) => d.activities.map((a) => [a._id as string, a.title] as const)));
  const dayNumber = new Map(subTrips.map((d) => [d._id as string, d.dayNumber]));
  const unchanged = planChangesNothing(plan, subTrips);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const onApply = async () => {
    setState({ status: "applying" });
    try {
      await apply({
        tripId,
        days: plan.days.map((d) => ({ subTripId: d.subTripId as Id<"subTrips">, items: d.items.map((i) => ({ activityId: i.activityId as Id<"activities">, startTime: i.startTime })) })),
        drop: plan.dropped.map((d) => d.activityId as Id<"activities">),
      });
      onClose();
    } catch (e) {
      setState({ status: "error", message: errorText(e, t("common.somethingWrong")) });
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal
        aria-labelledby="group-plan-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl"
      >
        <h2 id="group-plan-title" className="text-xl font-bold">
          🗳️ {t("groupVote.previewTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{plan.summary ?? t("groupVote.votesOnly")}</p>

        {unchanged ? (
          <p className="mt-5 rounded-2xl bg-muted p-4 text-sm">{t("groupVote.noChanges")}</p>
        ) : (
          <>
            {plan.days.map((d) => (
              <div key={d.subTripId} className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("time.dayN", { day: dayNumber.get(d.subTripId) ?? "?" })}</p>
                <ol className="mt-2 flex flex-col gap-1.5">
                  {d.items.map((i) => (
                    <li key={i.activityId} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm", i.movedFrom ? "bg-amber-500/10" : "bg-muted/60")}>
                      <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{i.startTime ? f.time(i.startTime) : ""}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{titles.get(i.activityId) ?? "…"}</span>
                      {i.movedFrom && <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">{t("groupVote.movedFrom", { day: t("time.dayN", { day: dayNumber.get(i.movedFrom) ?? "?" }) })}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {plan.dropped.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-danger">{t("groupVote.leavingOut")}</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {plan.dropped.map((d) => (
                    <li key={d.activityId} className="rounded-xl bg-danger/10 px-3 py-2 text-sm">
                      <span className="font-semibold line-through">{titles.get(d.activityId) ?? "…"}</span>
                      <span className="block text-xs text-muted-foreground">{d.reason ?? t("groupVote.votedDown")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {state.status === "error" && (
          <p role="alert" className="mt-4 text-sm font-semibold text-danger">
            {state.message}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 font-semibold text-muted-foreground hover:bg-muted">
            {t("groupVote.keep")}
          </button>
          {!unchanged && (
            <button
              onClick={() => void onApply()}
              disabled={state.status === "applying"}
              className="rounded-full bg-amber-500 px-5 py-2 font-semibold text-white shadow-md shadow-amber-500/25 hover:bg-amber-600 disabled:opacity-50"
            >
              {state.status === "applying" ? t("groupVote.applying") : t("groupVote.apply")}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
