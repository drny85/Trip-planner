"use client";

import { api } from "@trip/backend/api";
import { budgetOverview, currenciesIn, type BudgetScope, type Line } from "@trip/backend/budgetOverview";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useAction, useQuery } from "convex/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";

/** Rates fetched this session, so switching currencies back and forth doesn't refetch. */
const rateCache = new Map<string, number | null>();

/** How many `display` one unit of each code buys, from today's rates. */
function useRates(codes: string[], display: string) {
  const fetchRate = useAction(api.fx.rate);
  const key = codes.map((c) => `${c}>${display}`).join(",");
  const [, rerender] = useState(0);
  useEffect(() => {
    let live = true;
    const todo = codes.filter((c) => !rateCache.has(`${c}>${display}`));
    if (todo.length === 0) return;
    void Promise.all(
      todo.map((from) =>
        fetchRate({ from, to: display })
          .then((r) => rateCache.set(`${from}>${display}`, r?.rate ?? null))
          .catch(() => rateCache.set(`${from}>${display}`, null)),
      ),
    ).then(() => live && rerender((n) => n + 1));
    return () => {
      live = false;
    };
    // Only refetch when the set of pairs changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const rates: Record<string, number> = {};
  let loading = false;
  for (const c of codes) {
    const r = rateCache.get(`${c}>${display}`);
    if (r === undefined) loading = true;
    else if (r != null) rates[c] = r;
  }
  return { rates, loading };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, (part / whole) * 100) : part > 0 ? 100 : 0);

/**
 * The full trip budget: planned next to spent, by category and by day, from the
 * itinerary, priced bookings, shared costs and flights not booked yet. The math is
 * lib/budgetOverview.ts in the backend package, shared with mobile.
 */
export function BudgetOverviewView({ tripId }: { tripId: Id<"trips"> }) {
  const trip = useQuery(api.trips.get, { tripId });
  const extras = useQuery(api.budget.overview, { tripId });
  const { t, f, category } = useI18n();
  const [scope, setScope] = useState<BudgetScope>("me");
  const [picked, setPicked] = useState<string | null>(null);

  const local = extras?.tripCurrency ?? trip?.currency ?? "USD";
  const display = picked ?? local;
  const codes = useMemo(() => (trip && extras ? currenciesIn(trip, extras, display) : []), [trip, extras, display]);
  const { rates, loading } = useRates(codes, display);

  if (trip === undefined || extras === undefined) return <BudgetSkeleton />;
  if (trip === null || extras === null) return <p className="p-8 text-center text-muted-foreground">{t("budgetOverview.notFound")}</p>;

  const view = budgetOverview({ trip, extras, scope, display, rates });
  const money = (n: number) => f.money(Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100, display);
  const { planned, spent } = view.total;
  const over = spent > planned;
  const empty = planned === 0 && spent === 0;
  const choices = [
    { code: local, tag: t("budgetOverview.localTag") },
    { code: extras.homeCurrency, tag: t("budgetOverview.homeTag") },
    { code: extras.groupCurrency, tag: t("budgetOverview.groupTag") },
  ].filter((c, i, all): c is { code: string; tag: string } => !!c.code && all.findIndex((x) => x.code === c.code) === i);
  const hasDoneEstimates = extras.expenses.length === 0 && trip.subTrips.some((d) => d.activities.some((a) => a.isCompleted && a.estimatedCost != null && a.actualCost == null));

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6">
      <motion.header {...rise(0)}>
        <Link href={`/trips/${tripId}`} className="text-sm font-semibold text-primary hover:underline">
          ← {t("budgetOverview.back")}
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{t("budgetOverview.title")}</h1>
        <p className="mt-1 font-semibold text-muted-foreground">{trip.title}</p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("budgetOverview.intro")}</p>
      </motion.header>

      <motion.div {...rise(1)} className="mt-5 flex flex-wrap items-center gap-3">
        {extras.travelers > 1 && (
          <Segmented
            label={t("budgetOverview.scope")}
            value={scope}
            onChange={setScope}
            options={[
              { value: "me", label: t("budgetOverview.scopeMe") },
              { value: "group", label: t("budgetOverview.scopeGroup") },
            ]}
            id="scope"
          />
        )}
        {choices.length > 1 && (
          <Segmented
            label={t("budgetOverview.showIn")}
            value={display}
            onChange={setPicked}
            options={choices.map((c) => ({ value: c.code, label: `${c.code} · ${c.tag}` }))}
            id="currency"
          />
        )}
      </motion.div>

      <motion.section {...rise(2)} className="mt-5 rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-6" aria-label={t("budgetOverview.title")}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("budgetOverview.planned")}</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums">{money(planned)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("budgetOverview.spent")}</p>
            <p className={cn("mt-1 text-3xl font-extrabold tabular-nums", over && "text-danger")}>{money(spent)}</p>
          </div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
          <motion.div
            className={cn("h-full rounded-full", over ? "bg-danger" : "bg-gradient-to-r from-primary to-emerald-400")}
            initial={{ width: 0 }}
            animate={{ width: `${pct(spent, planned)}%` }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          />
        </div>
        {!empty && (
          <p className={cn("mt-2 text-sm tabular-nums", over ? "font-semibold text-danger" : "text-muted-foreground")}>
            {over ? t("budgetOverview.over", { amount: money(spent - planned) }) : t("budgetOverview.left", { amount: money(planned - spent) })}
            {planned > 0 && ` · ${t("budgetOverview.percentSpent", { percent: Math.round((spent / planned) * 100) })}`}
          </p>
        )}
        {empty && !loading && <p className="mt-3 text-sm text-muted-foreground">{t("budgetOverview.empty")}</p>}
        {loading && <p className="mt-3 text-sm text-muted-foreground">{t("budgetOverview.loadingRates")}</p>}
        {!loading && view.missingRates.length > 0 && <p className="mt-3 text-sm text-danger">{t("budgetOverview.noRate", { codes: view.missingRates.join(", ") })}</p>}
      </motion.section>

      {!empty && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Bars
            index={3}
            title={t("budgetOverview.byCategory")}
            money={money}
            rows={view.byCategory.map((c) => {
              const meta = category(c.category);
              return { key: c.category, label: `${meta.emoji} ${meta.text}`, color: meta.color, line: c };
            })}
          />
          <Bars
            index={4}
            title={t("budgetOverview.byDay")}
            money={money}
            rows={view.byDay.map((d) => ({
              key: d.key,
              // Day titles already read "Day 1 · Asakusa", so the title is the label when there is one.
              label: d.key === "before" ? t("budgetOverview.before") : d.key === "after" ? t("budgetOverview.after") : d.title || t("budgetOverview.dayN", { day: d.dayNumber ?? "" }),
              sub: d.date ? f.day(d.date) : undefined,
              color: "var(--color-primary)",
              line: d,
            }))}
          />
        </div>
      )}

      {view.bySource.length > 0 && (
        <motion.section {...rise(5)} className="mt-6 rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("budgetOverview.bySource")}</h2>
          <ul className="mt-4 divide-y divide-border/70">
            {view.bySource.map((s) => (
              <li key={s.source} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t(`budgetOverview.sources.${s.source}`)}</p>
                  <p className="text-xs text-muted-foreground">{t(`budgetOverview.sourceHints.${s.source}`)}</p>
                </div>
                <p className="text-sm tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{money(s.spent)}</span> {t("budgetOverview.spent").toLowerCase()} · {money(s.planned)} {t("budgetOverview.planned").toLowerCase()}
                </p>
              </li>
            ))}
          </ul>
          {hasDoneEstimates && <p className="mt-4 text-xs text-muted-foreground">{t("budgetOverview.doneCounts")}</p>}
        </motion.section>
      )}
    </main>
  );
}

function Segmented<V extends string>({ id, label, value, onChange, options }: { id: string; label: string; value: V; onChange: (v: V) => void; options: { value: V; label: string }[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-muted-foreground" id={`${id}-label`}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex rounded-full bg-muted p-1 text-sm font-semibold">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn("relative rounded-full px-3 py-1.5 transition-colors", value === o.value ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {value === o.value && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-full bg-card shadow-sm" transition={{ duration: 0.2, ease: EASE_OUT }} />}
            <span className="relative">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Planned as a light track, spent as the solid bar on top; red when a row goes over. */
function Bars({ index, title, rows, money }: { index: number; title: string; money: (n: number) => string; rows: { key: string; label: string; sub?: string; color: string; line: Line }[] }) {
  const { t } = useI18n();
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.line.planned, r.line.spent)));
  return (
    <motion.section {...rise(index)} className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <ul className="mt-4 flex flex-col gap-4">
        {rows.map((r) => {
          const over = r.line.spent > r.line.planned;
          return (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{r.label}</span>
                  {r.sub && <span className="ml-2 text-xs text-muted-foreground">{r.sub}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {t("budgetOverview.plannedSpent", { spent: money(r.line.spent), planned: money(r.line.planned) })
                    .split(money(r.line.spent))
                    .flatMap((part, i) => (i === 0 ? [part] : [<span key={i} className={cn("font-semibold", over ? "text-danger" : "text-foreground")}>{money(r.line.spent)}</span>, part]))}
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full opacity-25" style={{ width: `${pct(r.line.planned, scale)}%`, backgroundColor: r.color }} />
                <motion.span
                  className={cn("absolute inset-y-0 left-0 rounded-full", over && "bg-danger")}
                  style={over ? undefined : { backgroundColor: r.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct(r.line.spent, scale)}%` }}
                  transition={{ duration: 0.5, ease: EASE_OUT }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}

function BudgetSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl animate-pulse px-4 pt-6" aria-busy>
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="mt-4 h-9 w-64 rounded bg-muted" />
      <div className="mt-6 h-40 rounded-3xl bg-muted" />
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="h-64 rounded-3xl bg-muted" />
        <div className="h-64 rounded-3xl bg-muted" />
      </div>
    </main>
  );
}
