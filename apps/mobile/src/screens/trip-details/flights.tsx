import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { addDays, cn, daysUntil, fareAdvice, fareHistory, flexGrid, flightFit, localToday, type FareVerdict } from "@trip/ui";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { type ComponentRef, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Button } from "@/components/button";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { EASE_OUT } from "@/lib/motion";
import { openInAppBrowser } from "@/lib/open";

/**
 * Flights on the trip page, for travelers who haven't booked yet (backend:
 * convex/fares.ts): today's fare with a "good time to book?" hint, a ±3 day
 * grid, Book on Google Flights, and, once flights are on the trip, a one-tap
 * AI re-plan of the first and last days around them. The form is screens/watch-fares.
 */
type Data = NonNullable<FunctionReturnType<typeof api.fares.forTrip>>;
type Watch = NonNullable<Data["watch"]>;
type Day = { _id: Id<"subTrips">; dayNumber: number; date?: string; activities: unknown[] };

const errorText = (e: unknown) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : undefined);

const VERDICT: Record<FareVerdict, { emoji: string; box: string; text: string }> = {
  book: { emoji: "🟢", box: "bg-success/15", text: "text-success" },
  soon: { emoji: "⏳", box: "bg-accent/20", text: "text-foreground" },
  wait: { emoji: "📉", box: "bg-sky-500/15", text: "text-sky-700 dark:text-sky-300" },
  watch: { emoji: "👀", box: "bg-muted", text: "text-foreground" },
};

export function FlightsSection({ tripId, days }: { tripId: Id<"trips">; days: Day[] }) {
  const data = useCachedQuery(api.fares.forTrip, { tripId }).data;
  const { t } = useI18n();
  const router = useRouter();
  if (!data) return null;
  const upcoming = data.startDate > localToday();
  const fit = flightFit(data.flights, days);
  const showFit = data.isOwner && upcoming && Boolean(fit.arrive || fit.leave);
  const watch = data.watch;
  const showWatch = upcoming && (watch ? watch.status === "active" : !data.iHaveFlight);
  if (!showFit && !showWatch) return null;
  const openForm = () => router.push({ pathname: "/trips/[tripId]/fares", params: { tripId } });

  return (
    <View className="mt-6 gap-3 px-4">
      {showWatch && (
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">{t("fares.eyebrow")}</Text>
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">{t("fares.title")}</Text>
        </View>
      )}
      {showWatch &&
        (watch ? (
          <WatchCard data={data} watch={watch} tripId={tripId} onEdit={openForm} />
        ) : (
          <View className="gap-3 rounded-3xl bg-card p-4 shadow-sm shadow-black/5">
            <Text className="text-sm text-muted-foreground">{t("fares.intro")}</Text>
            {!data.enabled && <Text className="text-xs text-muted-foreground">✈️ {t("fares.off")}</Text>}
            <Button size="sm" icon="bell" onPress={openForm} className="self-start">
              {t("fares.watchFares")}
            </Button>
          </View>
        ))}
      {showFit && <FitAroundFlights tripId={tripId} fit={fit} days={days} />}
    </View>
  );
}

function WatchCard({ data, watch, tripId, onEdit }: { data: Data; watch: Watch; tripId: Id<"trips">; onEdit: () => void }) {
  const { t, f } = useI18n();
  const stop = useMutation(api.fares.stop);
  const bookStarted = useMutation(api.fares.bookStarted);
  const money = (cents: number) => f.money(cents / 100, watch.currency);
  const route = `${watch.from} → ${watch.to}`;

  const book = () => {
    void bookStarted({ tripId });
    void openInAppBrowser(watch.bookUrl);
  };
  const actions = (
    <View className="flex-row flex-wrap items-center gap-3">
      <Button size="sm" icon="airplane" onPress={book}>
        {t("fares.book", { site: watch.bookSite })}
      </Button>
      <Text onPress={onEdit} className="text-sm font-semibold text-primary">
        {t("fares.edit")}
      </Text>
      <Text onPress={() => void stop({ tripId })} className="text-sm text-muted-foreground">
        {t("fares.stop")}
      </Text>
    </View>
  );

  if (!data.enabled)
    return (
      <View className="rounded-3xl bg-card p-4">
        <Text className="text-sm text-muted-foreground">✈️ {t("fares.off")}</Text>
      </View>
    );
  if (watch.lastCents === undefined)
    return (
      <View className="gap-3 rounded-3xl bg-card p-4 shadow-sm shadow-black/5">
        <Text className="text-sm text-muted-foreground">
          {route} · {watch.error === "noResults" ? t("fares.noResults") : watch.error ? t("fares.failed") : t("fares.checking")}
        </Text>
        {actions}
      </View>
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
  const v = VERDICT[advice.verdict];
  const ins = watch.insights;
  const facts = [
    ins?.typicalLowCents !== undefined && ins.typicalHighCents !== undefined && t("fares.usually", { low: money(ins.typicalLowCents), high: money(ins.typicalHighCents) }),
    watch.lowestCents !== undefined && watch.lowestCents < watch.lastCents && t("fares.lowest", { amount: money(watch.lowestCents) }),
    watch.targetCents !== undefined && t("fares.targetLabel", { amount: money(watch.targetCents) }),
    watch.source === "travelpayouts" && t("fares.recentFares"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Animated.View entering={FadeIn.duration(220).easing(EASE_OUT)} className="gap-3 rounded-3xl bg-card p-4 shadow-sm shadow-black/5">
      {watch.bookStartedAt && <BookedIt tripId={tripId} />}
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Text className="text-3xl font-extrabold tracking-tight text-foreground">{money(watch.lastCents)}</Text>
          <Text className="text-xs text-muted-foreground">
            {[route, t(watch.returnDate ? "fares.roundTripFor" : "fares.oneWayFor", { count: watch.adults }), f.dateRange(watch.outboundDate, watch.returnDate ?? watch.outboundDate)].join(" · ")}
          </Text>
        </View>
        <Bars values={history.slice(-20).map((p) => p.cents)} />
      </View>
      {(ins?.level || facts) && (
        <View className="flex-row flex-wrap items-center gap-2">
          {ins?.level && (
            <View className={cn("rounded-md px-1.5 py-0.5", ins.level === "low" ? "bg-success/15" : ins.level === "high" ? "bg-danger/15" : "bg-muted")}>
              <Text className={cn("text-xs font-semibold", ins.level === "low" ? "text-success" : ins.level === "high" ? "text-danger" : "text-muted-foreground")}>{t(`fares.level.${ins.level}`)}</Text>
            </View>
          )}
          {facts ? <Text className="flex-1 text-xs text-muted-foreground">{facts}</Text> : null}
        </View>
      )}
      <View className={cn("rounded-2xl px-3 py-2", v.box)}>
        <Text className={cn("text-sm font-bold", v.text)}>
          {v.emoji} {t(`fares.verdict.${advice.verdict}`)}
        </Text>
        <Text className="text-sm text-foreground/90">{t(`fares.why.${advice.why}`, { percent: Math.round(Math.abs(advice.trend ?? 0) * 100) })}</Text>
      </View>

      {watch.offers.length > 0 && (
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("fares.bestOptions")}</Text>
          {watch.offers.map((o, i) => (
            <View key={i} className={cn("flex-row items-center gap-3 py-2.5", i < watch.offers.length - 1 && "border-b border-border/60")}>
              {o.logo ? <Image source={{ uri: o.logo }} style={{ width: 24, height: 24 }} contentFit="contain" /> : <Text className="w-6 text-center">✈️</Text>}
              <View className="flex-1">
                <Text className="font-semibold text-foreground" numberOfLines={1}>
                  {f.time(o.depTime)}
                  {o.arrTime ? ` → ${f.time(o.arrTime)}` : ""}
                  {o.arrDate && o.arrDate > o.depDate ? ` +${daysUntil(o.arrDate, o.depDate)}` : ""}
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {[o.airline, o.stops === 0 ? t("fares.nonstop") : t("fares.stops", { count: o.stops }), o.durationMinutes ? f.duration(o.durationMinutes) : null].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Text className="font-semibold text-foreground">{money(o.cents)}</Text>
            </View>
          ))}
        </View>
      )}

      <NearbyDates data={data} watch={watch} tripId={tripId} />
      {actions}
    </Animated.View>
  );
}

/** A tiny bar chart of the recent prices, lowest at the bottom. */
function Bars({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return (
    <View className="h-7 flex-row items-end gap-0.5" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((v, i) => (
        <View key={i} className={cn("w-1 rounded-sm", i === values.length - 1 ? "bg-primary" : "bg-primary/35")} style={{ height: 4 + ((v - min) / span) * 24 }} />
      ))}
    </View>
  );
}

function BookedIt({ tripId }: { tripId: Id<"trips"> }) {
  const { t } = useI18n();
  const router = useRouter();
  const notYet = useMutation(api.fares.notBookedYet);
  return (
    <View className="gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-3">
      <Text className="font-semibold text-foreground">🎫 {t("fares.bookedIt")}</Text>
      <Text className="text-sm text-muted-foreground">{t("fares.bookedItBody")}</Text>
      <View className="flex-row gap-2">
        <Button size="sm" icon="plus" onPress={() => router.push({ pathname: "/trips/[tripId]/import", params: { tripId } })}>
          {t("fares.addConfirmation")}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => void notYet({ tripId })}>
          {t("fares.notYet")}
        </Button>
      </View>
    </View>
  );
}

function NearbyDates({ data, watch, tripId }: { data: Data; watch: Watch; tripId: Id<"trips"> }) {
  const { t, f, locale } = useI18n();
  const check = useMutation(api.fares.checkNearbyDates);
  const move = useMutation(api.fares.moveTrip);
  const money = (cents: number) => f.money(cents / 100, watch.currency);
  const fresh = watch.flex && watch.flex.outboundDate === watch.outboundDate;
  const canMove = data.isOwner && !data.hasBookings;
  const [moving, setMoving] = useState(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);

  const onMove = (shiftDays: number, outboundDate: string, returnDate?: string) =>
    Alert.alert(t("fares.moveTrip"), t("fares.moveConfirm", { dates: f.dateRange(outboundDate, returnDate ?? addDays(data.endDate, shiftDays)) }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("fares.move"),
        onPress: async () => {
          setMoving(true);
          try {
            await move({ tripId, days: shiftDays, language: locale });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {
            Alert.alert(t("common.somethingWrong"), errorText(e));
          } finally {
            setMoving(false);
          }
        },
      },
    ]);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("fares.nearby")}</Text>
          {!fresh && <Text className="text-xs text-muted-foreground">{t("fares.nearbyIntro")}</Text>}
        </View>
        {!fresh && (
          <Button
            size="sm"
            variant="secondary"
            icon="calendar"
            loading={watch.flexStatus === "checking"}
            onPress={() => check({ tripId, language: locale }).catch((e: unknown) => Alert.alert(t("fares.nearbyFailed"), errorText(e)))}
          >
            {t("fares.checkNearby")}
          </Button>
        )}
      </View>
      {watch.flexStatus === "failed" && <Text className="text-xs text-danger">{t("fares.nearbyFailed")}</Text>}
      {fresh && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
            // Start with the trip's own dates (the 4th of 7 cells, 80 wide + 8 gap) in the middle.
            ref={scroller}
            onLayout={(e) => scroller.current?.scrollTo({ x: Math.max(0, 3 * 88 + 40 - e.nativeEvent.layout.width / 2), animated: false })}
          >
            {flexGrid(watch.flex!.cells, watch.lastCents).map((c) => {
              const mine = c.shiftDays === 0;
              const tappable = canMove && !mine && c.cents !== undefined && !moving;
              return (
                <Pressable
                  key={c.shiftDays}
                  disabled={!tappable}
                  onPress={() => onMove(c.shiftDays, c.outboundDate, c.returnDate)}
                  accessibilityRole="button"
                  accessibilityHint={tappable ? t("fares.moveTrip") : undefined}
                  className={cn("w-20 items-center rounded-2xl border px-1 py-2", mine ? "border-primary bg-primary/5" : "border-border", c.cheapest && "border-success bg-success/10")}
                >
                  <Text className="text-[11px] font-semibold text-muted-foreground" numberOfLines={1}>
                    {mine ? t("fares.yourDates") : weekdayShort(f.tag, c.outboundDate)}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
                    {f.day(c.outboundDate)}
                  </Text>
                  <Text className={cn("mt-1 text-sm font-bold", c.cheapest ? "text-success" : "text-foreground")} numberOfLines={1}>
                    {c.cents !== undefined ? money(c.cents) : "—"}
                  </Text>
                  {c.deltaCents !== undefined && c.deltaCents !== 0 && (
                    <Text className={cn("text-[11px]", c.deltaCents < 0 ? "text-success" : "text-muted-foreground")} numberOfLines={1}>
                      {c.deltaCents < 0 ? "−" : "+"}
                      {money(Math.abs(c.deltaCents))}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          {!canMove && <Text className="text-xs text-muted-foreground">{data.isOwner ? t("fares.errHasBookings") : t("fares.askOrganizer")}</Text>}
        </>
      )}
    </View>
  );
}

/** "Sat" for "2027-04-03", in the reader's language. */
const weekdayShort = (tag: string, iso: string) => new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

function FitAroundFlights({ tripId, fit, days }: { tripId: Id<"trips">; fit: ReturnType<typeof flightFit>; days: Day[] }) {
  const { t, f } = useI18n();
  const router = useRouter();
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
  ].filter((r): r is { key: string; dayId: string; label: string; reason: string } => Boolean(r) && days.some((d) => d._id === (r as { dayId: string }).dayId && d.activities.length > 0));
  if (rows.length === 0) return null;

  return (
    <View className="gap-2 rounded-3xl bg-card p-4 shadow-sm shadow-black/5">
      <Text className="font-bold text-foreground">🛬 {t("fares.fitTitle")}</Text>
      {rows.map((r) => (
        <View key={r.key} className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-sm text-muted-foreground">{r.label}</Text>
          <Button
            size="sm"
            variant="secondary"
            icon="sparkles"
            onPress={() => router.push({ pathname: "/trips/[tripId]/replan/[subTripId]", params: { tripId, subTripId: r.dayId, reason: r.reason } })}
          >
            {t("fares.fitButton")}
          </Button>
        </View>
      ))}
    </View>
  );
}
