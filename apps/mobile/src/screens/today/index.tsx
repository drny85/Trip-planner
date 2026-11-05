import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import type { ActivityNode, TripDetails } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import {
  cn,
  distanceKm,
  estimateTravel,
  findTodayDay,
  fromMinutes,
  hasCoords,
  leaveBy,
  localToday,
  todayAlerts,
  todayStatus,
  type Coords,
  type LiveWeather,
  type TodayAlert,
} from "@trip/ui";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import { Button } from "@/components/button";
import { OfflineBanner } from "@/components/offline-banner";
import { SmartImage } from "@/components/smart-image";
import { useToggleDone } from "@/components/undo-toast";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { EASE_OUT } from "@/lib/motion";
import { callPhone, openDirections, openInAppBrowser } from "@/lib/open";
import { useLiveWeather, useMyLocation, useNowMinutes } from "./hooks";

type Day = TripDetails["subTrips"][number];
/** Farther than this from the next stop, your position isn't useful for a travel time. */
const FAR_KM = 30;

/**
 * Live "today" mode: what's next, how long it takes to get there, the weather for
 * the next hours, and a one-tap re-plan when you're running late or rain is coming.
 * `previewDay` shows any day as if it were today.
 */
export function TodayScreen({ tripId, previewDay }: { tripId: Id<"trips">; previewDay?: number }) {
  const { data: trip, isCached } = useCachedQuery(api.trips.get, { tripId });
  const { t } = useI18n();
  if (trip === undefined) return <ActivityIndicator className="mt-16" />;
  if (trip === null) return <Text className="p-8 text-center text-muted-foreground">{t("trip.notFound")}</Text>;

  const today = localToday();
  const live = findTodayDay(trip, today);
  const day = (previewDay != null ? trip.subTrips.find((d) => d.dayNumber === previewDay) : undefined) ?? live;
  if (!day) return <NotToday trip={trip} today={today} />;
  return <Today key={day._id} trip={trip} day={day} isPreview={day !== live} isCached={isCached} />;
}

function Today({ trip, day, isPreview, isCached }: { trip: TripDetails; day: Day; isPreview: boolean; isCached: boolean }) {
  const router = useRouter();
  const now = useNowMinutes();
  const { t, f } = useI18n();
  const status = todayStatus(day.activities, now);
  const { next, lastDone } = status;
  const canEdit = trip.myRole === "owner";

  const weatherAt = (hasCoords(next) ? next : day.activities.find((a) => hasCoords(a))) as Coords | undefined;
  const weather = useLiveWeather(weatherAt ?? null);
  const location = useMyLocation();
  const alerts = todayAlerts(status, weather, now);

  const me = location.status === "on" ? location.coords : null;
  const meNear = me && hasCoords(next) && distanceKm(me, next) <= FAR_KM ? me : null;
  const from = meNear ?? (hasCoords(lastDone) ? lastDone : null);
  const travel = from && hasCoords(next) ? estimateTravel(from, next) : null;

  const replan = (reason?: string) => {
    void Haptics.selectionAsync();
    router.push({
      pathname: "/trips/[tripId]/replan/[subTripId]",
      params: { tripId: trip._id, subTripId: day._id, now: fromMinutes(now), ...(reason ? { reason } : {}) },
    });
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 px-4 pb-16 pt-2">
      <Stack.Screen options={{ title: isPreview ? t("today.previewTitle", { day: day.dayNumber }) : t("today.title") }} />
      <OfflineBanner cached={isCached} />
      <Text className="text-sm text-muted-foreground">
        {trip.title} · {t("time.dayN", { day: day.dayNumber })}
        {day.date ? ` · ${f.weekday(day.date)}` : ""} · {f.time(fromMinutes(now))}
      </Text>

      <WeatherStrip weather={weather} />

      {alerts.map((a) => (
        <AlertCard key={a.kind} alert={a} day={day} canEdit={canEdit} onReplan={() => replan(a.reason)} />
      ))}

      {next ? (
        <NextCard
          key={next._id}
          stop={next}
          isNow={status.current?._id === next._id}
          travel={travel}
          travelFrom={meNear ? t("today.fromYou") : lastDone ? t("today.fromPlace", { place: lastDone.title }) : undefined}
          location={location}
          far={!!me && !meNear}
        />
      ) : (
        <Animated.View entering={FadeIn.duration(300).easing(EASE_OUT)} className="items-center gap-2 rounded-3xl bg-card p-8">
          <Text className="text-5xl">🎉</Text>
          <Text className="text-xl font-bold text-foreground">{t("today.wrapTitle")}</Text>
          <Text className="text-center text-muted-foreground">{t("today.wrapBody", { count: status.total })}</Text>
        </Animated.View>
      )}

      <View className="mt-2 flex-row items-baseline justify-between">
        <Text className="text-lg font-bold text-foreground">{t("today.restOfDay")}</Text>
        <Text className="text-sm text-muted-foreground">
          {t("today.doneCount", { done: status.done, total: status.total })}
        </Text>
      </View>
      <View className="gap-1">
        {day.activities.map((a, i) => {
          const prev = day.activities[i - 1];
          const leg = i > 0 && hasCoords(prev) && hasCoords(a) ? estimateTravel(prev, a) : null;
          return <TimelineRow key={a._id} stop={a} leg={leg} isNext={a._id === next?._id} />;
        })}
      </View>
      {canEdit && next && (
        <Button variant="secondary" icon="sparkles" onPress={() => replan()}>
          {t("today.replanRest")}
        </Button>
      )}
    </ScrollView>
  );
}

function WeatherStrip({ weather }: { weather: LiveWeather | null }) {
  const { t, f } = useI18n();
  if (!weather) return null;
  return (
    <Animated.View entering={FadeIn.duration(240).easing(EASE_OUT)} className="flex-row items-center gap-3 rounded-3xl bg-card p-3">
      <View className="flex-row items-center gap-2 pl-1 pr-2">
        <Text className="text-3xl">{weather.now.emoji}</Text>
        <View>
          <Text className="text-2xl font-extrabold text-foreground">{weather.now.temp}°</Text>
          <Text className="text-xs text-muted-foreground">{t(`weather.${weather.now.kind}`)}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5">
        {weather.hours.slice(1, 9).map((h) => (
          <View key={h.time} className={cn("w-14 items-center gap-0.5 rounded-2xl py-2", h.rainChance >= 50 ? "bg-sky-500/15" : "bg-muted")}>
            <Text className="text-[11px] text-muted-foreground">{f.time(h.time).replace(":00", "")}</Text>
            <Text className="text-sm">{h.emoji}</Text>
            <Text className="text-xs font-semibold text-foreground">{h.temp}°</Text>
            {h.rainChance >= 30 && <Text className="text-[10px] text-sky-600">☂ {h.rainChance}%</Text>}
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

function AlertCard({ alert, day, canEdit, onReplan }: { alert: TodayAlert; day: Day; canEdit: boolean; onReplan: () => void }) {
  const shift = useMutation(api.activities.shiftTimes);
  const [shifted, setShifted] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { t, f } = useI18n();
  const rain = alert.kind === "rain";
  const push = alert.kind === "late" ? Math.min(180, Math.ceil(alert.minutes / 15) * 15) : 0;

  const run = async (minutes: number) => {
    setBusy(true);
    try {
      await shift({ subTripId: day._id, minutes });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShifted(shifted ? null : minutes);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(260).easing(EASE_OUT)}
      exiting={FadeOut.duration(150)}
      layout={LinearTransition}
      accessibilityRole="alert"
      className={cn("gap-3 rounded-3xl border p-4", rain ? "border-sky-500/30 bg-sky-500/10" : "border-amber-500/30 bg-amber-500/10")}
    >
      <View className="flex-row gap-3">
        <Text className="text-2xl">{rain ? "🌧️" : "⏰"}</Text>
        <View className="flex-1 gap-0.5">
          <Text className="font-bold text-foreground">{rain ? t("today.rainFrom", { time: f.time(alert.at), percent: alert.chance }) : t("today.behind", { duration: f.duration(alert.minutes) })}</Text>
          <Text className="text-sm text-muted-foreground">{rain ? outdoorText(t, alert.outdoor) : t("today.lateBody")}</Text>
        </View>
      </View>
      {canEdit ? (
        <View className="flex-row flex-wrap gap-2">
          <Button size="sm" icon="sparkles" onPress={onReplan}>
            {rain ? t("today.swapIndoor") : t("today.replanFromNow")}
          </Button>
          {alert.kind === "late" && (
            <Button size="sm" variant="secondary" loading={busy} onPress={() => void run(shifted ? -shifted : push)}>
              {shifted ? t("today.movedUndoShort", { minutes: shifted }) : t("today.pushBackShort", { minutes: push })}
            </Button>
          )}
        </View>
      ) : (
        <Text className="text-xs text-muted-foreground">{t("today.organizerCan")}</Text>
      )}
    </Animated.View>
  );
}

function NextCard({
  stop,
  isNow,
  travel,
  travelFrom,
  location,
  far,
}: {
  stop: ActivityNode;
  isNow: boolean;
  travel: ReturnType<typeof estimateTravel> | null;
  travelFrom?: string;
  location: ReturnType<typeof useMyLocation>;
  far: boolean;
}) {
  const toggleDone = useToggleDone();
  const { t, f, category } = useI18n();
  const badge = category(stop.category, stop.subcategory);
  const leave = travel && !isNow ? leaveBy(stop, travel.minutes) : undefined;
  const step = stop.children.find((c) => !c.isCompleted);

  return (
    <Animated.View entering={FadeInDown.duration(320).easing(EASE_OUT)} className="overflow-hidden rounded-[28px] bg-slate-950">
      <SmartImage uri={stop.photoUrl} seed={stop.title} emoji={badge.emoji} tint={badge.color} className="absolute inset-0" />
      <LinearGradient colors={["rgba(2,6,23,0.25)", "rgba(2,6,23,0.85)", "rgba(2,6,23,0.98)"]} className="absolute inset-0" />
      <View className="gap-2 p-5 pt-28">
        <Text className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">{isNow ? t("today.happeningNow") : t("today.upNext")}</Text>
        <Text className="text-[28px] font-extrabold leading-8 text-white" numberOfLines={2}>
          {stop.title}
        </Text>
        <Text className="text-sm text-white/75" numberOfLines={2}>
          {[f.time(stop.startTime), `${badge.emoji} ${badge.text}`, stop.durationMinutes ? f.duration(stop.durationMinutes) : null, stop.address].filter(Boolean).join(" · ")}
        </Text>
        {step && (
          <Text className="self-start rounded-2xl bg-white/10 px-3 py-2 text-sm text-white">
            {t("today.nextStep")} <Text className="font-semibold">{step.title}</Text>
          </Text>
        )}

        {travel && (
          <View className="mt-1 self-start rounded-2xl bg-white/10 px-3 py-2">
            <Text className="text-sm text-white">
              {travel.mode === "walk" ? "🚶" : "🚇"} {t(travel.mode === "walk" ? "today.travelWalk" : "today.travelTransit", { duration: f.duration(travel.minutes) })}
              {travelFrom ? <Text className="text-white/60"> {travelFrom}</Text> : null}
            </Text>
            {leave && <Text className="mt-0.5 text-sm font-semibold text-emerald-300">{t("today.leaveBy", { time: f.time(leave) })}</Text>}
          </View>
        )}
        {location.status !== "on" && (
          <Pressable onPress={location.enable} disabled={location.status === "asking"} className="self-start rounded-2xl bg-white/10 px-3 py-2 active:opacity-70">
            <Text className="text-sm font-semibold text-white">
              📍 {location.status === "denied" ? t("today.locationBlockedMobile") : location.status === "unavailable" ? t("today.locationUnavailable") : t("today.useLocation")}
            </Text>
          </Pressable>
        )}
        {far && <Text className="text-xs text-white/60">{t("today.far", { km: FAR_KM })}</Text>}

        <View className="mt-3 flex-row flex-wrap gap-2">
          <Button
            size="sm"
            variant="light"
            icon="check"
            onPress={() => {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              void toggleDone(step ?? stop, true);
            }}
          >
            {step ? t("mobileUpNext.stepDone") : t("upNext.markDone")}
          </Button>
          <Button size="sm" variant="glass" icon="directions" onPress={() => void openDirections(stop)}>
            {t("activity.directions")}
          </Button>
          {stop.phone && (
            <Button size="sm" variant="glass" icon="phone" onPress={() => void callPhone(stop.phone!)}>
              {t("activity.call")}
            </Button>
          )}
          {stop.bookingUrl && (
            <Button size="sm" variant="glass" icon="ticket" onPress={() => void openInAppBrowser(stop.bookingUrl!)}>
              {t("activity.reserve")}
            </Button>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

function TimelineRow({ stop, leg, isNext }: { stop: ActivityNode; leg: ReturnType<typeof estimateTravel> | null; isNext: boolean }) {
  const toggleDone = useToggleDone();
  const { t, f, category } = useI18n();
  const badge = category(stop.category, stop.subcategory);
  return (
    <Animated.View layout={LinearTransition}>
      {leg && (
        <Text className="ml-12 py-1 text-xs text-muted-foreground">
          {leg.mode === "walk" ? "🚶" : "🚇"} ~{f.duration(leg.minutes)}
        </Text>
      )}
      <View className={cn("flex-row items-center gap-3 rounded-2xl border px-3 py-2.5", isNext ? "border-primary/40 bg-primary/10" : "border-border bg-card", stop.isCompleted && "opacity-60")}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: stop.isCompleted }}
          accessibilityLabel={t(stop.isCompleted ? "activity.markNotDone" : "activity.markDone", { title: stop.title })}
          hitSlop={8}
          onPress={() => {
            void Haptics.selectionAsync();
            void toggleDone(stop, !stop.isCompleted);
          }}
          className={cn("h-7 w-7 items-center justify-center rounded-full border-2", stop.isCompleted ? "border-success bg-success" : "border-border")}
        >
          {stop.isCompleted && <Text className="text-xs font-bold text-white">✓</Text>}
        </Pressable>
        <Text className="w-[68px] text-sm font-semibold text-muted-foreground">{f.time(stop.startTime)}</Text>
        <Text className={cn("flex-1 font-semibold text-foreground", stop.isCompleted && "line-through")} numberOfLines={1}>
          {badge.emoji} {stop.title}
        </Text>
        {isNext && (
          <View className="rounded-full bg-primary px-2 py-0.5">
            <Text className="text-xs font-semibold text-primary-foreground">{t("today.next")}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function NotToday({ trip, today }: { trip: TripDetails; today: string }) {
  const router = useRouter();
  const startsIn = Math.round((Date.parse(`${trip.startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const over = today > trip.endDate;
  const { t } = useI18n();
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="items-center gap-4 p-8">
      <Text className="text-5xl">{over ? "🧳" : "🗓️"}</Text>
      <Text className="text-center text-2xl font-bold text-foreground">{over ? t("today.tripOver") : t("today.startsIn", { title: trip.title, count: startsIn })}</Text>
      <Text className="text-center text-muted-foreground">{t("today.notTodayBody")}</Text>
      <View className="flex-row flex-wrap justify-center gap-2">
        {trip.subTrips.slice(0, 7).map((d) => (
          <Button key={d._id} size="sm" variant="secondary" onPress={() => router.setParams({ day: String(d.dayNumber) })}>
            {t("today.previewDay", { day: d.dayNumber })}
          </Button>
        ))}
      </View>
    </ScrollView>
  );
}

/** "Park, Garden and more are outdoors." */
function outdoorText(t: ReturnType<typeof useI18n>["t"], places: string[]) {
  const listed = places.slice(0, 3).join(", ");
  return t("today.outdoors", { count: places.length, places: places.length > 3 ? t("today.andMore", { places: listed }) : listed });
}
