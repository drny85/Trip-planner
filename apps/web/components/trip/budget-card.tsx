"use client";

import { budgetSummary } from "@trip/backend/budget";
import type { PublicTripDetails } from "@trip/backend/types";
import { cn, formatMoney, getCategory } from "@trip/ui";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";

/**
 * Estimated cost per person by category and by day, with what's been spent so
 * far. "Spent" counts entered actual costs, plus the estimate of anything already
 * checked off without one.
 */
export function BudgetCard({ trip }: { trip: PublicTripDetails }) {
  const budget = useMemo(() => budgetSummary(trip), [trip]);
  const [view, setView] = useState<"category" | "day">("category");
  const currency = trip.currency ?? "USD";
  const money = (n: number) => formatMoney(n, currency);
  const { estimated, actual } = budget.total;
  if (estimated === 0 && actual === 0) return null;

  const spentPct = estimated ? Math.min(100, Math.round((actual / estimated) * 100)) : 0;
  const over = actual > estimated;
  const rows =
    view === "category"
      ? budget.byCategory.map((c) => {
          const meta = getCategory(c.category);
          return { key: c.category, label: `${meta.emoji} ${meta.label}`, color: meta.color, ...c.money };
        })
      : budget.byDay.map((d) => ({ key: d.subTripId, label: `Day ${d.dayNumber}`, color: "var(--color-primary)", ...d.money }));
  const max = Math.max(1, ...rows.map((r) => Math.max(r.estimated, r.actual)));

  return (
    <motion.section {...rise(1)} className="mt-6 rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-6" aria-labelledby="budget-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="budget-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Budget per person
          </h2>
          <p className="mt-1 text-3xl font-extrabold tabular-nums">{money(estimated)}</p>
          <p className={cn("text-sm tabular-nums", over ? "font-semibold text-destructive" : "text-muted-foreground")}>
            {money(actual)} spent{over ? ` · ${money(actual - estimated)} over` : ` · ${money(estimated - actual)} left`}
          </p>
        </div>
        <div role="tablist" aria-label="Group budget by" className="flex rounded-full bg-muted p-1 text-sm font-semibold">
          {(["category", "day"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn("relative rounded-full px-3 py-1.5 transition-colors", view === v ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {view === v && <motion.span layoutId="budget-tab" className="absolute inset-0 -z-0 rounded-full bg-card shadow-sm" transition={{ duration: 0.2, ease: EASE_OUT }} />}
              <span className="relative">{v === "category" ? "By category" : "By day"}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-gradient-to-r from-primary to-emerald-400")}
          initial={{ width: 0 }}
          animate={{ width: `${spentPct}%` }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        />
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.ul
          key={view}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="mt-5 flex flex-col gap-3"
        >
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_auto]">
              <span className="truncate font-semibold">{r.label}</span>
              <span className="relative h-2 overflow-hidden rounded-full bg-muted">
                <span className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${(r.estimated / max) * 100}%`, backgroundColor: r.color }} />
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.actual / max) * 100}%`, backgroundColor: r.color }} />
              </span>
              <span className="text-right tabular-nums text-muted-foreground">
                {r.actual > 0 && <span className="font-semibold text-foreground">{money(r.actual)} / </span>}
                {money(r.estimated)}
              </span>
            </li>
          ))}
        </motion.ul>
      </AnimatePresence>
    </motion.section>
  );
}
