"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn, flightTone, isUpcoming, localToday, priceSummary, sparkline, type FlightTone } from "@trip/ui";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE_OUT } from "@/lib/motion";

/**
 * Price and flight alerts under a saved booking: live flight status (gate,
 * terminal, delay) and a daily price watch for flights and hotels. Everyone on
 * the trip gets a push when something changes (backend: convex/alerts.ts).
 */
export type AlertsData = NonNullable<FunctionReturnType<typeof api.alerts.forTrip>>;
type Booking = { _id: Id<"bookings">; kind: string; startDate?: string };

const TONE: Record<FlightTone, string> = {
  good: "bg-success/15 text-success",
  warn: "bg-accent/20 text-foreground",
  bad: "bg-danger/15 text-danger",
  neutral: "bg-muted text-muted-foreground",
};

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : fallback);

export function BookingAlerts({ booking, alerts }: { booking: Booking; alerts: AlertsData }) {
  if (booking.kind !== "flight" && booking.kind !== "hotel") return null;
  const track = alerts.tracks.find((tr) => tr.bookingId === booking._id);
  const watch = alerts.watches.find((w) => w.bookingId === booking._id);
  const upcoming = isUpcoming(booking.startDate, localToday());
  if (!track && !watch && !upcoming) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5 pl-9 text-xs">
      {booking.kind === "flight" && <FlightStatus bookingId={booking._id} track={track} alerts={alerts} upcoming={upcoming} />}
      <PriceWatch booking={booking} watch={watch} alerts={alerts} upcoming={upcoming} />
    </div>
  );
}

function FlightStatus({
  bookingId,
  track,
  alerts,
  upcoming,
}: {
  bookingId: Id<"bookings">;
  track?: AlertsData["tracks"][number];
  alerts: AlertsData;
  upcoming: boolean;
}) {
  const { t, f } = useI18n();
  const setAlerts = useMutation(api.alerts.setFlightAlerts);
  const canTrack = alerts.watchable.some((w) => w.bookingId === bookingId && w.flightNumber);
  if (!track && !(canTrack && upcoming)) return null;
  if (!alerts.flightsEnabled) return <p className="text-muted-foreground">✈️ {t("alerts.flightsOff")}</p>;

  const toggle = (on: boolean) => void setAlerts({ bookingId, on });
  if (!track || track.muted)
    return (
      <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
        🔕 {t("alerts.alertsOff")}
        <button onClick={() => toggle(true)} className="font-semibold text-primary hover:underline">
          {t("alerts.turnOn")}
        </button>
      </p>
    );

  const s = track.snapshot;
  const statusKey = (s?.status ?? "Unknown") as keyof typeof STATUS_KEYS;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {s ? (
        <>
          <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", TONE[flightTone(s.status, s.delayMinutes)])}>
            {s.delayMinutes >= 15 && s.status !== "Canceled"
              ? t("alerts.delayed", { minutes: s.delayMinutes })
              : t(STATUS_KEYS[statusKey] ?? "alerts.status.Unknown")}
          </span>
          <span className="text-muted-foreground">
            {[
              s.depTime && t("alerts.leaves", { time: f.time(s.depTime) }),
              s.depTerminal && t("alerts.terminal", { terminal: s.depTerminal }),
              s.depGate && t("alerts.gate", { gate: s.depGate }),
              s.arrTime && t("alerts.lands", { time: f.time(s.arrTime) }),
              s.arrBelt && t("alerts.belt", { belt: s.arrBelt }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">🔔 {t("alerts.tracking")}</span>
      )}
      <button
        onClick={() => toggle(false)}
        title={t("alerts.turnOff")}
        aria-label={t("alerts.turnOff")}
        className="text-muted-foreground transition hover:text-foreground"
      >
        🔕
      </button>
    </div>
  );
}

const STATUS_KEYS = {
  Expected: "alerts.status.Expected",
  CheckIn: "alerts.status.CheckIn",
  Boarding: "alerts.status.Boarding",
  GateClosed: "alerts.status.GateClosed",
  Departed: "alerts.status.Departed",
  EnRoute: "alerts.status.EnRoute",
  Approaching: "alerts.status.Approaching",
  Arrived: "alerts.status.Arrived",
  Delayed: "alerts.status.Delayed",
  Canceled: "alerts.status.Canceled",
  Diverted: "alerts.status.Diverted",
  CanceledUncertain: "alerts.status.CanceledUncertain",
  Unknown: "alerts.status.Unknown",
} as const;

function PriceWatch({ booking, watch, alerts, upcoming }: { booking: Booking; watch?: AlertsData["watches"][number]; alerts: AlertsData; upcoming: boolean }) {
  const { t, f } = useI18n();
  const stop = useMutation(api.alerts.stopWatching);
  const [editing, setEditing] = useState(false);
  const money = (cents: number) => f.money(cents / 100, alerts.currency);

  let body: React.ReactNode = null;
  if (watch?.status === "ended") body = <span className="text-muted-foreground">{t("alerts.ended")}</span>;
  else if (watch && !alerts.pricesEnabled) body = <span className="text-muted-foreground">📉 {t("alerts.pricesOff")}</span>;
  else if (watch && watch.lastCents === undefined)
    body = (
      <span className="text-muted-foreground">
        📉 {watch.error === "noResults" ? t("alerts.noResults") : watch.error ? t("alerts.failed") : t("alerts.checking")}
      </span>
    );
  else if (watch) {
    const p = priceSummary(watch);
    const points = sparkline(p.trend, 48, 14);
    body = (
      <>
        <span className="font-semibold">📉 {t("alerts.now", { amount: money(watch.lastCents!) })}</span>
        {p.deltaCents !== undefined && p.deltaCents !== 0 && (
          <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", p.deltaCents < 0 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
            {p.deltaCents < 0 ? `▼ ${t("alerts.cheaper", { amount: money(-p.deltaCents) })}` : `▲ ${t("alerts.pricier", { amount: money(p.deltaCents) })}`}
          </span>
        )}
        {points && (
          <svg width="48" height="14" viewBox="-1 -1 50 16" className="text-primary" aria-hidden>
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
        <span className="text-muted-foreground">
          {[
            p.referenceCents !== undefined &&
              (p.referenceIsPaid ? t("alerts.paidLabel", { amount: money(p.referenceCents) }) : t("alerts.startedAt", { amount: money(p.referenceCents) })),
            p.lowestCents !== undefined && t("alerts.lowest", { amount: money(p.lowestCents) }),
            booking.kind === "flight" && watch.matched === false && t("alerts.cheapestOnRoute"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </>
    );
  }

  if (!watch && !upcoming) return null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {body}
        {watch ? (
          <>
            {upcoming && watch.status === "active" && (
              <button onClick={() => setEditing((e) => !e)} className="font-semibold text-primary hover:underline">
                {t("alerts.edit")}
              </button>
            )}
            <button onClick={() => void stop({ bookingId: booking._id })} className="text-muted-foreground hover:text-danger hover:underline">
              {t("alerts.stop")}
            </button>
          </>
        ) : (
          !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-full border border-border px-2.5 py-0.5 font-semibold transition hover:border-primary hover:text-primary"
            >
              🔔 {t("alerts.watchPrice")}
            </button>
          )
        )}
      </div>
      <AnimatePresence initial={false}>
        {editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <WatchForm booking={booking} watch={watch} alerts={alerts} onDone={() => setEditing(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WatchForm({ booking, watch, alerts, onDone }: { booking: Booking; watch?: AlertsData["watches"][number]; alerts: AlertsData; onDone: () => void }) {
  const { t, f, locale } = useI18n();
  const watchPrice = useMutation(api.alerts.watchPrice);
  const parsed = alerts.watchable.find((w) => w.bookingId === booking._id);
  const isFlight = booking.kind === "flight";
  const [from, setFrom] = useState(watch?.from ?? parsed?.from ?? "");
  const [to, setTo] = useState(watch?.to ?? parsed?.to ?? "");
  const [paid, setPaid] = useState(watch?.paidCents ? String(watch.paidCents / 100) : "");
  const [adults, setAdults] = useState(String(watch?.adults ?? (isFlight ? alerts.travelers : Math.min(alerts.travelers, 2) || 2)));
  const [state, setState] = useState<{ busy: boolean; error?: string }>({
    busy: false,
  });
  const input = "rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-primary";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const paidCents = Math.round(parseFloat(paid.replace(",", ".")) * 100);
    setState({ busy: true });
    try {
      await watchPrice({
        bookingId: booking._id,
        from: isFlight ? from : undefined,
        to: isFlight ? to : undefined,
        paidCents: paidCents > 0 ? paidCents : undefined,
        adults: Number(adults) || undefined,
        language: locale,
      });
      onDone();
    } catch (err) {
      setState({
        busy: false,
        error: errorText(err, t("alerts.couldntWatch")),
      });
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="font-semibold">{t("alerts.watchTitle")}</p>
      <p className="text-muted-foreground">{t("alerts.watchIntro")}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {isFlight && (
          <>
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-muted-foreground">{t("alerts.from")}</span>
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="SFO"
                className={cn(input, "w-16 font-mono uppercase")}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-muted-foreground">{t("alerts.to")}</span>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="NRT"
                className={cn(input, "w-16 font-mono uppercase")}
              />
            </label>
          </>
        )}
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-muted-foreground">{t("alerts.paid", { currency: f.currencySymbol(alerts.currency) })}</span>
          <input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" placeholder="0" className={cn(input, "w-28 tabular-nums")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-muted-foreground">{isFlight ? t("alerts.travelers") : t("alerts.guests")}</span>
          <input
            value={adults}
            onChange={(e) => setAdults(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            maxLength={1}
            className={cn(input, "w-14 tabular-nums")}
          />
        </label>
        <button
          type="submit"
          disabled={state.busy}
          className="rounded-full bg-primary px-3 py-1.5 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {watch ? t("alerts.save") : t("alerts.start")}
        </button>
        <button type="button" onClick={onDone} className="px-2 py-1.5 font-semibold text-muted-foreground hover:text-foreground">
          {t("common.cancel")}
        </button>
      </div>
      <p className="mt-1.5 text-muted-foreground">
        {isFlight ? `${t("alerts.airportHint")} ` : ""}
        {t("alerts.paidHint")}
      </p>
      {state.error && <p className="mt-1 font-semibold text-danger">{state.error}</p>}
    </form>
  );
}
