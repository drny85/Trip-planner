import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn, flightTone, isUpcoming, localToday, priceSummary, type FlightTone } from "@trip/ui";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

/**
 * Price and flight alerts under a saved booking: live flight status (gate,
 * terminal, delay) and the daily price watch. The watch form is the
 * trips/[tripId]/watch sheet (screens/watch-price).
 */
export type AlertsData = NonNullable<FunctionReturnType<typeof api.alerts.forTrip>>;
type Booking = { _id: Id<"bookings">; tripId: Id<"trips">; kind: string; startDate?: string };

const TONE: Record<FlightTone, { box: string; text: string }> = {
  good: { box: "bg-success/15", text: "text-success" },
  warn: { box: "bg-accent/20", text: "text-foreground" },
  bad: { box: "bg-danger/15", text: "text-danger" },
  neutral: { box: "bg-muted", text: "text-muted-foreground" },
};

export const STATUS_KEYS = {
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

export function BookingAlerts({ booking, alerts }: { booking: Booking; alerts: AlertsData }) {
  if (booking.kind !== "flight" && booking.kind !== "hotel") return null;
  const track = alerts.tracks.find((tr) => tr.bookingId === booking._id);
  const watch = alerts.watches.find((w) => w.bookingId === booking._id);
  const upcoming = isUpcoming(booking.startDate, localToday());
  if (!track && !watch && !upcoming) return null;
  return (
    <View className="gap-1.5 pb-3 pl-9">
      {booking.kind === "flight" && <FlightStatus bookingId={booking._id} track={track} alerts={alerts} upcoming={upcoming} />}
      <PriceWatch booking={booking} watch={watch} alerts={alerts} upcoming={upcoming} />
    </View>
  );
}

function FlightStatus({ bookingId, track, alerts, upcoming }: { bookingId: Id<"bookings">; track?: AlertsData["tracks"][number]; alerts: AlertsData; upcoming: boolean }) {
  const { t, f } = useI18n();
  const setAlerts = useMutation(api.alerts.setFlightAlerts);
  const canTrack = alerts.watchable.some((w) => w.bookingId === bookingId && w.flightNumber);
  if (!track && !(canTrack && upcoming)) return null;
  if (!alerts.flightsEnabled) return <Text className="text-xs text-muted-foreground">✈️ {t("alerts.flightsOff")}</Text>;

  const toggle = (on: boolean) => {
    void Haptics.selectionAsync();
    void setAlerts({ bookingId, on });
  };
  if (!track || track.muted)
    return (
      <Text className="text-xs text-muted-foreground">
        🔕 {t("alerts.alertsOff")}{"  "}
        <Text onPress={() => toggle(true)} className="font-semibold text-primary">
          {t("alerts.turnOn")}
        </Text>
      </Text>
    );

  const s = track.snapshot;
  const tone = TONE[s ? flightTone(s.status, s.delayMinutes) : "neutral"];
  const label = s
    ? s.delayMinutes >= 15 && s.status !== "Canceled"
      ? t("alerts.delayed", { minutes: s.delayMinutes })
      : t(STATUS_KEYS[(s.status as keyof typeof STATUS_KEYS) ?? "Unknown"] ?? "alerts.status.Unknown")
    : undefined;
  const facts = s
    ? [
        s.depTime && t("alerts.leaves", { time: f.time(s.depTime) }),
        s.depTerminal && t("alerts.terminal", { terminal: s.depTerminal }),
        s.depGate && t("alerts.gate", { gate: s.depGate }),
        s.arrTime && t("alerts.lands", { time: f.time(s.arrTime) }),
      ]
        .filter(Boolean)
        .join(" · ")
    : t("alerts.tracking");
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {label && (
        <View className={cn("rounded-md px-1.5 py-0.5", tone.box)}>
          <Text className={cn("text-xs font-semibold", tone.text)}>{label}</Text>
        </View>
      )}
      <Text className="flex-1 text-xs text-muted-foreground">{facts}</Text>
      <Pressable onPress={() => toggle(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("alerts.turnOff")}>
        <Text className="text-xs">🔕</Text>
      </Pressable>
    </View>
  );
}

function PriceWatch({ booking, watch, alerts, upcoming }: { booking: Booking; watch?: AlertsData["watches"][number]; alerts: AlertsData; upcoming: boolean }) {
  const { t, f } = useI18n();
  const router = useRouter();
  const stop = useMutation(api.alerts.stopWatching);
  const money = (cents: number) => f.money(cents / 100, alerts.currency);
  const edit = () => router.push({ pathname: "/trips/[tripId]/watch", params: { tripId: booking.tripId, bookingId: booking._id } });
  if (!watch) {
    if (!upcoming) return null;
    return (
      <Pressable onPress={edit} accessibilityRole="button" className="self-start rounded-full border border-border px-2.5 py-1">
        <Text className="text-xs font-semibold text-foreground">🔔 {t("alerts.watchPrice")}</Text>
      </Pressable>
    );
  }

  let line: string;
  let delta: { text: string; good: boolean } | undefined;
  if (watch.status === "ended") line = t("alerts.ended");
  else if (!alerts.pricesEnabled) line = `📉 ${t("alerts.pricesOff")}`;
  else if (watch.lastCents === undefined) line = `📉 ${watch.error === "noResults" ? t("alerts.noResults") : watch.error ? t("alerts.failed") : t("alerts.checking")}`;
  else {
    const p = priceSummary(watch);
    line = [
      `📉 ${t("alerts.now", { amount: money(watch.lastCents) })}`,
      p.referenceCents !== undefined && (p.referenceIsPaid ? t("alerts.paidLabel", { amount: money(p.referenceCents) }) : t("alerts.startedAt", { amount: money(p.referenceCents) })),
      p.lowestCents !== undefined && t("alerts.lowest", { amount: money(p.lowestCents) }),
      booking.kind === "flight" && watch.matched === false && t("alerts.cheapestOnRoute"),
    ]
      .filter(Boolean)
      .join(" · ");
    if (p.deltaCents)
      delta = p.deltaCents < 0 ? { text: `▼ ${t("alerts.cheaper", { amount: money(-p.deltaCents) })}`, good: true } : { text: `▲ ${t("alerts.pricier", { amount: money(p.deltaCents) })}`, good: false };
  }

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {delta && (
        <View className={cn("rounded-md px-1.5 py-0.5", delta.good ? "bg-success/15" : "bg-muted")}>
          <Text className={cn("text-xs font-semibold", delta.good ? "text-success" : "text-muted-foreground")}>{delta.text}</Text>
        </View>
      )}
      <Text className="flex-1 text-xs text-foreground">{line}</Text>
      {upcoming && watch.status === "active" && (
        <Text onPress={edit} className="text-xs font-semibold text-primary">
          {t("alerts.edit")}
        </Text>
      )}
      <Text onPress={() => void stop({ bookingId: booking._id })} className="text-xs text-muted-foreground">
        {t("alerts.stop")}
      </Text>
    </View>
  );
}
