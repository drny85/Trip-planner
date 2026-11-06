"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { addDays, cn, daysUntil, fareAdvice, fareHistory, flexGrid, flightFit, localToday, sparkline, type FareVerdict } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";
import { useOpenImport } from "./bookings";
import { ReplanDialog, type ReplanDayInput } from "./replan-day";

/**
 * Flights, for travelers who haven't booked yet (backend: convex/fares.ts):
 * today's cheapest fare from their airport with a "good time to book?" hint,
 * a ±3 day grid, a Book link to Google Flights, and, once flights are on the
 * trip, a one-tap AI re-plan of the first and last days around them.
 */
type Data = NonNullable<FunctionReturnType<typeof api.fares.forTrip>>;
type Watch = NonNullable<Data["watch"]>;

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : fallback);

const VERDICT: Record<FareVerdict, { emoji: string; tone: string }> = {
  book: { emoji: "🟢", tone: "bg-success/15 text-success" },
  soon: { emoji: "⏳", tone: "bg-accent/20 text-foreground" },
  wait: { emoji: "📉", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  watch: { emoji: "👀", tone: "bg-muted text-muted-foreground" },
};

export function Flights({ tripId, days }: { tripId: Id<"trips">; days: ReplanDayInput[] }) {
  const data = useQuery(api.fares.forTrip, { tripId });
  const { t } = useI18n();
  if (!data) return null;
  const upcoming = data.startDate > localToday();
  const fit = flightFit(data.flights, days);
  const showFit = data.isOwner && upcoming && Boolean(fit.arrive || fit.leave);
  const watch = data.watch;
  const showWatch = upcoming && (watch ? watch.status === "active" : !data.iHaveFlight);
  if (!showFit && !showWatch) return null;

  return (
    <motion.section {...rise(0)} className="mt-6 rounded-3xl border border-border/70 bg-card p-5 shadow-sm" aria-labelledby="flights-title">
      {showWatch && (
        <>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("fares.eyebrow")}</p>
          <h2 id="flights-title" className="text-lg font-bold">
            ✈️ {t("fares.title")}
          </h2>
          {watch ? <WatchView data={data} watch={watch} tripId={tripId} /> : <Start data={data} tripId={tripId} />}
        </>
      )}
      {showFit && <FitAroundFlights fit={fit} days={days} first={!showWatch} />}
    </motion.section>
  );
}

function Start({ data, tripId }: { data: Data; tripId: Id<"trips"> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="mt-0.5 text-sm text-muted-foreground">{t("fares.intro")}</p>
      {!data.enabled && <p className="mt-2 text-sm text-muted-foreground">✈️ {t("fares.off")}</p>}
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div key="form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }} className="overflow-hidden">
            <WatchForm data={data} tripId={tripId} onDone={() => setOpen(false)} />
          </motion.div>
        ) : (
          <motion.button
            key="start"
            onClick={() => setOpen(true)}
            className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:opacity-90 active:scale-[0.97]"
          >
            🔔 {t("fares.watchFares")}
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

function WatchForm({ data, tripId, watch, onDone }: { data: Data; tripId: Id<"trips">; watch?: Watch; onDone: () => void }) {
  const { t, f, locale } = useI18n();
  const save = useMutation(api.fares.watch);
  const [from, setFrom] = useState(watch?.from ?? data.homeAirport ?? "");
  const [to, setTo] = useState(watch?.to ?? data.suggestedTo ?? "");
  const [roundTrip, setRoundTrip] = useState(watch ? Boolean(watch.returnDate) : true);
  const [adults, setAdults] = useState(String(watch?.adults ?? 1));
  const [target, setTarget] = useState(watch?.targetCents ? String(watch.targetCents / 100) : "");
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const input = "rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-primary";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCents = Math.round(parseFloat(target.replace(",", ".")) * 100);
    setState({ busy: true });
    try {
      await save({ tripId, from, to, roundTrip, adults: Number(adults) || 1, targetCents: targetCents > 0 ? targetCents : undefined, language: locale });
      onDone();
    } catch (err) {
      setState({ busy: false, error: errorText(err, t("fares.couldntWatch")) });
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
      <p className="text-muted-foreground">{f.dateRange(data.startDate, data.endDate)}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-muted-foreground">{t("fares.from")}</span>
          <input value={from} onChange={(e) => setFrom(e.target.value.toUpperCase())} maxLength={3} placeholder="SFO" className={cn(input, "w-20 font-mono uppercase")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-muted-foreground">{t("fares.to")}</span>
          <input value={to} onChange={(e) => setTo(e.target.value.toUpperCase())} maxLength={3} placeholder="NRT" className={cn(input, "w-20 font-mono uppercase")} />
        </label>
        <div className="flex rounded-full bg-muted p-0.5" role="radiogroup">
          {[true, false].map((rt) => (
            <button
              key={String(rt)}
              type="button"
              role="radio"
              aria-checked={roundTrip === rt}
              onClick={() => setRoundTrip(rt)}
              className={cn("rounded-full px-3 py-1.5 font-semibold transition-colors", roundTrip === rt ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
            >
              {rt ? t("fares.roundTrip") : t("fares.oneWay")}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-muted-foreground">{t("fares.travelers")}</span>
          <input value={adults} onChange={(e) => setAdults(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={1} className={cn(input, "w-14 tabular-nums")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-muted-foreground">{t("fares.target", { currency: f.currencySymbol(data.currency) })}</span>
          <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="0" className={cn(input, "w-28 tabular-nums")} />
        </label>
      </div>
      <p className="mt-1.5 text-muted-foreground">
        {t("fares.airportHint")} {t("fares.targetHint")}
      </p>
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={state.busy} className="rounded-full bg-primary px-3 py-1.5 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
          {watch ? t("fares.save") : t("fares.start")}
        </button>
        <button type="button" onClick={onDone} className="px-2 py-1.5 font-semibold text-muted-foreground hover:text-foreground">
          {t("common.cancel")}
        </button>
      </div>
      {state.error && <p className="mt-1 font-semibold text-danger">{state.error}</p>}
    </form>
  );
}

function WatchView({ data, watch, tripId }: { data: Data; watch: Watch; tripId: Id<"trips"> }) {
  const { t, f } = useI18n();
  const stop = useMutation(api.fares.stop);
  const bookStarted = useMutation(api.fares.bookStarted);
  const [editing, setEditing] = useState(false);
  const money = (cents: number) => f.money(cents / 100, watch.currency);
  const route = `${watch.from} → ${watch.to}`;

  if (editing) return <WatchForm data={data} tripId={tripId} watch={watch} onDone={() => setEditing(false)} />;

  const actions = (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <a
        href={watch.bookUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => void bookStarted({ tripId })}
        className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:opacity-90 active:scale-[0.97]"
      >
        {t("fares.book", { site: watch.bookSite })} ↗
      </a>
      <button onClick={() => setEditing(true)} className="font-semibold text-primary hover:underline">
        {t("fares.edit")}
      </button>
      <button onClick={() => void stop({ tripId })} className="text-muted-foreground hover:text-danger hover:underline">
        {t("fares.stop")}
      </button>
    </div>
  );

  if (!data.enabled) return <p className="mt-2 text-sm text-muted-foreground">✈️ {t("fares.off")}</p>;
  if (watch.lastCents === undefined)
    return (
      <>
        <p className="mt-2 text-sm text-muted-foreground">
          {route} · {watch.error === "noResults" ? t("fares.noResults") : watch.error ? t("fares.failed") : t("fares.checking")}
        </p>
        {actions}
      </>
    );

  const history = fareHistory(watch.insights?.history ?? [], watch.history);
  const advice = fareAdvice({
    cents: watch.lastCents,
    daysOut: daysUntil(watch.outboundDate, localToday()),
    level: watch.insights?.level,
    typicalLowCents: watch.insights?.typicalLowCents,
    typicalHighCents: watch.insights?.typicalHighCents,
    history,
  });
  const points = sparkline(
    history.map((p) => p.cents),
    120,
    28,
  );
  const v = VERDICT[advice.verdict];
  const ins = watch.insights;

  return (
    <div className="mt-2">
      {watch.bookStartedAt && <BookedIt tripId={tripId} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-extrabold tabular-nums tracking-tight">{money(watch.lastCents)}</p>
          <p className="text-xs text-muted-foreground">
            {[route, t(watch.returnDate ? "fares.roundTripFor" : "fares.oneWayFor", { count: watch.adults }), f.dateRange(watch.outboundDate, watch.returnDate ?? watch.outboundDate)].join(" · ")}
          </p>
        </div>
        {points && (
          <svg width="120" height="28" viewBox="-1 -1 122 30" className="text-primary" aria-hidden>
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {ins?.level && (
          <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", ins.level === "low" ? "bg-success/15 text-success" : ins.level === "high" ? "bg-danger/15 text-danger" : "bg-muted text-muted-foreground")}>
            {t(`fares.level.${ins.level}`)}
          </span>
        )}
        <span className="text-muted-foreground">
          {[
            ins?.typicalLowCents !== undefined && ins.typicalHighCents !== undefined && t("fares.usually", { low: money(ins.typicalLowCents), high: money(ins.typicalHighCents) }),
            watch.lowestCents !== undefined && watch.lowestCents < watch.lastCents && t("fares.lowest", { amount: money(watch.lowestCents) }),
            watch.targetCents !== undefined && t("fares.targetLabel", { amount: money(watch.targetCents) }),
            watch.source === "travelpayouts" && t("fares.recentFares"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <div className={cn("mt-3 rounded-2xl px-3 py-2 text-sm", v.tone)}>
        <span className="font-bold">
          {v.emoji} {t(`fares.verdict.${advice.verdict}`)}
        </span>{" "}
        <span className="opacity-90">{t(`fares.why.${advice.why}`, { percent: Math.round(Math.abs(advice.trend ?? 0) * 100) })}</span>
      </div>

      {watch.offers.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(watch.offers.every((o) => o.depDate !== watch.outboundDate) ? "fares.closestDates" : "fares.bestOptions")}</p>
          <ul className="mt-1 flex flex-col">
            {watch.offers.map((o, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-border/60 py-2 text-sm last:border-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- tiny airline logo from Google */}
                {o.logo ? <img src={o.logo} alt="" className="h-6 w-6 shrink-0 rounded object-contain" /> : <span className="w-6 text-center">✈️</span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold tabular-nums">
                    {f.time(o.depTime)}
                    {o.arrTime && ` → ${f.time(o.arrTime)}`}
                    {o.arrDate && o.arrDate > o.depDate && <sup className="ml-0.5 text-[10px] text-muted-foreground">+{daysUntil(o.arrDate, o.depDate)}</sup>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[o.depDate !== watch.outboundDate ? f.dateRange(o.depDate, o.retDate ?? o.depDate) : null, o.airline, o.stops === 0 ? t("fares.nonstop") : t("fares.stops", { count: o.stops }), o.durationMinutes ? f.duration(o.durationMinutes) : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{money(o.cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <NearbyDates data={data} watch={watch} tripId={tripId} />
      {actions}
    </div>
  );
}

function BookedIt({ tripId }: { tripId: Id<"trips"> }) {
  const { t } = useI18n();
  const openImport = useOpenImport();
  const notYet = useMutation(api.fares.notBookedYet);
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm">
      <p className="font-semibold">🎫 {t("fares.bookedIt")}</p>
      <p className="text-muted-foreground">{t("fares.bookedItBody")}</p>
      <div className="mt-2 flex gap-2">
        {openImport && (
          <button onClick={openImport} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            ＋ {t("fares.addConfirmation")}
          </button>
        )}
        <button onClick={() => void notYet({ tripId })} className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold">
          {t("fares.notYet")}
        </button>
      </div>
    </motion.div>
  );
}

function NearbyDates({ data, watch, tripId }: { data: Data; watch: Watch; tripId: Id<"trips"> }) {
  const { t, f, locale } = useI18n();
  const check = useMutation(api.fares.checkNearbyDates);
  const move = useMutation(api.fares.moveTrip);
  const [error, setError] = useState<string | null>(null);
  const money = (cents: number) => f.money(cents / 100, watch.currency);
  const fresh = watch.flex && watch.flex.outboundDate === watch.outboundDate;
  const canMove = data.isOwner && !data.hasBookings;
  // On narrow screens the grid scrolls: start with the trip's own dates in the middle.
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = grid.current;
    const mine = box?.querySelector<HTMLElement>("[data-mine]");
    if (box && mine) box.scrollLeft = mine.offsetLeft - (box.clientWidth - mine.clientWidth) / 2;
  }, [fresh]);

  const onMove = async (shiftDays: number, outboundDate: string, returnDate?: string) => {
    if (!canMove) return;
    if (!window.confirm(t("fares.moveConfirm", { dates: f.dateRange(outboundDate, returnDate ?? addDays(data.endDate, shiftDays)) }))) return;
    try {
      await move({ tripId, days: shiftDays, language: locale });
    } catch (e) {
      setError(errorText(e, t("common.somethingWrong")));
    }
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("fares.nearby")}</p>
          {!fresh && <p className="text-xs text-muted-foreground">{t("fares.nearbyIntro")}</p>}
        </div>
        {!fresh && (
          <button
            disabled={watch.flexStatus === "checking"}
            onClick={() => {
              setError(null);
              check({ tripId, language: locale }).catch((e: unknown) => setError(errorText(e, t("fares.nearbyFailed"))));
            }}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold transition hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {watch.flexStatus === "checking" ? t("fares.checkingNearby") : `📅 ${t("fares.checkNearby")}`}
          </button>
        )}
      </div>
      {watch.flexStatus === "failed" && <p className="mt-1 text-xs text-danger">{t("fares.nearbyFailed")}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {fresh && (
        <>
          <div ref={grid} className="relative -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {flexGrid(watch.flex!.cells, watch.lastCents).map((c) => {
              const mine = c.shiftDays === 0;
              const clickable = canMove && !mine && c.cents !== undefined;
              return (
                <button
                  key={c.shiftDays}
                  data-mine={mine || undefined}
                  disabled={!clickable}
                  onClick={() => void onMove(c.shiftDays, c.outboundDate, c.returnDate)}
                  title={clickable ? t("fares.moveTrip") : !mine && !data.isOwner ? t("fares.askOrganizer") : undefined}
                  className={cn(
                    "flex min-w-[5.25rem] flex-1 flex-col items-center rounded-xl border px-1 py-2 text-center text-[11px] transition",
                    mine ? "border-primary bg-primary/5" : "border-border",
                    c.cheapest && "border-success bg-success/10",
                    clickable && "hover:border-primary hover:shadow-sm active:scale-[0.97]",
                  )}
                >
                  <span className="w-full truncate font-semibold text-muted-foreground">{mine ? t("fares.yourDates") : weekdayShort(f.tag, c.outboundDate)}</span>
                  <span className="w-full truncate text-muted-foreground">{f.day(c.outboundDate)}</span>
                  <span className={cn("mt-1 w-full truncate font-bold tabular-nums", c.cheapest && "text-success")}>{c.cents !== undefined ? money(c.cents) : "—"}</span>
                  {c.deltaCents !== undefined && c.deltaCents !== 0 && (
                    <span className={cn("w-full truncate tabular-nums", c.deltaCents < 0 ? "text-success" : "text-muted-foreground")}>
                      {c.deltaCents < 0 ? "−" : "+"}
                      {money(Math.abs(c.deltaCents))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {!canMove && <p className="mt-1 text-xs text-muted-foreground">{data.isOwner ? t("fares.errHasBookings") : t("fares.askOrganizer")}</p>}
        </>
      )}
    </div>
  );
}

/** "Sat" for "2027-04-03", in the reader's language. */
const weekdayShort = (tag: string, iso: string) => new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

function FitAroundFlights({ fit, days, first }: { fit: ReturnType<typeof flightFit>; days: ReplanDayInput[]; first: boolean }) {
  const { t, f } = useI18n();
  const [open, setOpen] = useState<{ day: ReplanDayInput; reason: string } | null>(null);
  const rows = [
    fit.arrive && {
      key: "arrive",
      dayId: fit.arrive.subTripId,
      label: t("fares.fitArrive", { day: fit.arrive.dayNumber, time: f.time(fit.arrive.lands) }),
      reason: t("fares.fitArriveReason", { time: f.time(fit.arrive.lands), ready: f.time(fit.arrive.freeFrom) }),
    },
    fit.leave && {
      key: "leave",
      dayId: fit.leave.subTripId,
      label: t("fares.fitLeave", { day: fit.leave.dayNumber, time: f.time(fit.leave.takesOff) }),
      reason: t("fares.fitLeaveReason", { time: f.time(fit.leave.takesOff), leave: f.time(fit.leave.leaveBy) }),
    },
  ].filter((r): r is { key: string; dayId: string; label: string; reason: string } => Boolean(r));

  return (
    <div className={cn(!first && "mt-5 border-t border-border/60 pt-4")}>
      <p className={cn(first ? "text-lg font-bold" : "text-sm font-semibold")}>🛬 {t("fares.fitTitle")}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((r) => {
          const day = days.find((d) => d._id === r.dayId);
          if (!day || day.activities.length === 0) return null;
          return (
            <li key={r.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{r.label}</span>
              <button onClick={() => setOpen({ day, reason: r.reason })} className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold transition hover:text-primary">
                ✨ {t("fares.fitButton")}
              </button>
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {open && <ReplanDialog key="fit" day={open.day} weather={null} rainy={false} initialReason={open.reason} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </div>
  );
}
