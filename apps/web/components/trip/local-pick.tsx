"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { toLocalPickArgs, type LocalPickProposal } from "@trip/backend/localPick";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useAction, useMutation } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE_OUT } from "@/lib/motion";

type Day = { _id: Id<"subTrips">; dayNumber: number; localPickAt?: number; activities: { _id: string; title: string; localTips?: unknown[] }[] };

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : fallback);

/** The day's "local's pick" switch: off opens the swap dialog, on shows that it's on (and how to undo it). */
export function LocalPickButton({ day, canEdit }: { day: Day; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const on = Boolean(day.localPickAt);
  if (!canEdit) {
    return on ? <span className="rounded-full bg-violet-600/10 px-3 py-1.5 text-sm font-semibold text-violet-700 dark:text-violet-300">💎 {t("local.gem")}</span> : null;
  }
  if (day.activities.length === 0) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={on ? t("local.on") : t("local.buttonTitle")}
        aria-pressed={on}
        className={cn(
          "rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-[0.97]",
          on ? "bg-violet-600 text-white shadow-md shadow-violet-600/30 hover:bg-violet-700" : "bg-muted text-muted-foreground hover:text-foreground",
        )}
      >
        💎<span className={cn(!on && "sr-only sm:not-sr-only")}> {t("local.button")}</span>
      </button>
      <AnimatePresence>{open && <LocalPickDialog key="local" day={day} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

function LocalPickDialog({ day, onClose }: { day: Day; onClose: () => void }) {
  const pick = useAction(api.ai.localPickDay);
  const addTips = useAction(api.ai.addLocalTips);
  const apply = useMutation(api.localPicks.apply);
  const restore = useMutation(api.localPicks.restore);
  const { t, f, locale, category } = useI18n();
  const [busy, setBusy] = useState<"thinking" | "tips" | "applying" | "restoring" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposal, setProposal] = useState<LocalPickProposal | null>(null);
  const on = Boolean(day.localPickAt);
  const missingTips = day.activities.some((a) => !a.localTips?.length);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const run = async <T,>(kind: NonNullable<typeof busy>, task: () => Promise<T>) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      return await task();
    } catch (e) {
      setError(errorText(e, t("common.somethingWrong")));
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  const keptIds = new Set(proposal?.activities.flatMap((a) => ("keepId" in a ? [a.keepId] : [])));
  const removed = proposal ? day.activities.filter((a) => !keptIds.has(a._id)) : [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal
        aria-labelledby="local-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl"
      >
        <h2 id="local-title" className="text-xl font-bold">
          💎 {t("local.title", { day: day.dayNumber })}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("local.intro")}</p>

        {on && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-violet-600/10 p-3 text-sm">
            <span className="flex-1 font-semibold text-violet-700 dark:text-violet-300">{t("local.on")}</span>
            <button
              disabled={busy !== null}
              onClick={async () => {
                const done = await run("restoring", async () => {
                  await restore({ subTripId: day._id });
                  return true;
                });
                if (done) onClose();
              }}
              className="rounded-full bg-card px-3 py-1.5 font-semibold shadow-sm transition hover:bg-muted disabled:opacity-50"
            >
              {busy === "restoring" ? t("local.undoing") : `↩ ${t("local.undo")}`}
            </button>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={async () => {
              setProposal(null);
              const next = await run("thinking", () => pick({ subTripId: day._id, language: locale }));
              if (next) setProposal(next);
            }}
            disabled={busy !== null}
            className="flex-1 rounded-full bg-violet-600 py-2.5 font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-700 disabled:opacity-50 active:scale-[0.98]"
          >
            {busy === "thinking" ? t("local.thinking") : proposal ? t("common.retry") : `💎 ${t("local.find")}`}
          </button>
          {missingTips && !proposal && (
            <button
              onClick={async () => {
                const count = await run("tips", () => addTips({ subTripId: day._id, language: locale }));
                if (count !== undefined) setNotice(count > 0 ? t("local.tipsAdded", { count }) : t("local.noTips"));
              }}
              disabled={busy !== null}
              className="flex-1 rounded-full bg-muted py-2.5 font-semibold transition hover:bg-border disabled:opacity-50 active:scale-[0.98]"
            >
              {busy === "tips" ? t("local.addingTips") : `💡 ${t("local.addTips")}`}
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {notice && <p className="mt-3 rounded-2xl bg-success/10 p-3 text-sm font-semibold text-success">✓ {notice}</p>}
        {(busy === "thinking" || busy === "tips") && (
          <div className="mt-5 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-2xl bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}

        <AnimatePresence>
          {proposal && busy !== "thinking" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="mt-5">
              <p className="rounded-2xl bg-violet-600/5 p-3 text-sm">{proposal.summary}</p>
              <ol className="mt-3 flex flex-col gap-1.5">
                {proposal.activities.map((a, i) => {
                  const isNew = !("keepId" in a);
                  return (
                    <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04, duration: 0.2 }} className={cn("rounded-2xl border px-3 py-2 text-sm", isNew ? "border-violet-500/40 bg-violet-600/5" : "border-border")}>
                      <div className="flex items-center gap-3">
                        <span className="w-16 shrink-0 font-semibold tabular-nums text-muted-foreground">{f.time(a.startTime)}</span>
                        <span className="flex-1 truncate font-semibold">{a.title}</span>
                        {isNew ? (
                          <span className="shrink-0 rounded-full bg-violet-600/15 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                            💎 {category(a.category, a.subcategory).emoji}
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-muted-foreground">{t("replan.kept")}</span>
                        )}
                      </div>
                      {isNew && a.replaces && <p className="mt-0.5 pl-[4.75rem] text-xs text-muted-foreground">{t("local.replaces", { title: a.replaces })}</p>}
                    </motion.li>
                  );
                })}
              </ol>
              {removed.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{t("replan.removed", { titles: removed.map((r) => r.title).join(", ") })}</p>}
              <div className="mt-4 flex gap-2">
                <button onClick={onClose} className="flex-1 rounded-full bg-muted py-2.5 font-semibold">
                  {t("local.keepMine")}
                </button>
                <button
                  disabled={busy !== null}
                  onClick={async () => {
                    const done = await run("applying", async () => {
                      await apply({ subTripId: day._id, activities: toLocalPickArgs(proposal) });
                      return true;
                    });
                    if (done) onClose();
                  }}
                  className="flex-1 rounded-full bg-violet-600 py-2.5 font-semibold text-white disabled:opacity-50"
                >
                  {busy === "applying" ? t("local.applying") : t("local.usePicks")}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
