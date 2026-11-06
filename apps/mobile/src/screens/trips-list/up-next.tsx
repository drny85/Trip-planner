import { api } from "@trip/backend/api";
import { applyPendingToTrip } from "@trip/backend/offline";
import type { TripDetails } from "@trip/backend/types";
import { pickUpNext, type UpNext as UpNextData } from "@trip/backend/upNext";
import { useI18n } from "@trip/i18n/react";
import { localToday } from "@trip/ui";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeInRight, FadeOutLeft, ReduceMotion } from "react-native-reanimated";
import { Button } from "@/components/button";
import { useToggleDone } from "@/components/undo-toast";
import { LinearGradient } from "@/components/gradient";
import { PressableScale } from "@/components/pressable-scale";
import { SmartImage } from "@/components/smart-image";
import { openDirections } from "@/lib/open";
import { CSS_EASE_OUT, EASE_OUT } from "@/lib/motion";
import { cacheKey, useCachedQuery } from "@/hooks/use-cached-query";
import { readCache } from "@/lib/offline-cache";
import { useOutbox } from "@/lib/outbox";

/** Soft pulse for the live dot; loops, so it lives in a CSS animation on the UI thread. */
const pulse = {
  "0%": { opacity: 0.7, transform: [{ scale: 1 }] },
  "100%": { opacity: 0, transform: [{ scale: 2.4 }] },
};

/**
 * Home-screen hero for the next thing to do on the current or upcoming trip.
 * Checking it off slides the next activity in.
 */
export function UpNext() {
  const [today] = useState(localToday);
  const next = useUpNextWithPending(today);
  const toggleDone = useToggleDone();
  const router = useRouter();
  const { t, f, category } = useI18n();
  if (!next) return null;

  const { trip, day, activity, step, later } = next;
  const badge = category(activity.category, activity.subcategory);
  const target = step ?? activity;
  const pct = day.total ? Math.round((day.done / day.total) * 100) : 0;

  const markDone = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void toggleDone(target, true);
  };

  return (
    <Animated.View entering={FadeIn.duration(300).easing(EASE_OUT)}>
      <PressableScale
        accessibilityHint={t("mobileUpNext.opensTrip")}
        pressedScale={0.985}
        onPress={() => router.push({ pathname: "/trips/[tripId]", params: { tripId: trip._id } })}
        className="overflow-hidden rounded-[28px] bg-slate-950"
      >
        <SmartImage uri={trip.imageUrl} seed={trip.destination} emoji="🌏" tint="#0e7c66" className="absolute inset-0" />
        <LinearGradient
          colors={["rgba(2,6,23,0.96)", "rgba(2,6,23,0.8)", "rgba(14,124,102,0.65)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="absolute inset-0"
        />

        <View className="gap-4 p-5">
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="flex-row items-center gap-2 rounded-full bg-white/15 px-3 py-1">
              <View className="h-2 w-2">
                <Animated.View
                  className="absolute inset-0 rounded-full bg-emerald-300"
                  style={{ animationName: pulse, animationDuration: "1.6s", animationIterationCount: "infinite", animationTimingFunction: CSS_EASE_OUT }}
                />
                <View className="h-2 w-2 rounded-full bg-emerald-300" />
              </View>
              <Text className="text-[11px] font-bold uppercase tracking-widest text-white">{t("upNext.label")}</Text>
            </View>
            <View className="rounded-full bg-white/10 px-3 py-1">
              <Text className="text-xs font-semibold text-white">{f.countdown(next.startsInDays, day.dayNumber)}</Text>
            </View>
          </View>

          {/* Keyed so a checked-off activity slides out and the next one slides in. */}
          <Animated.View
            key={target._id}
            entering={FadeInRight.duration(260).easing(EASE_OUT).reduceMotion(ReduceMotion.System)}
            exiting={FadeOutLeft.duration(180).reduceMotion(ReduceMotion.System)}
            className="gap-1.5"
          >
            <Text className="text-xs font-semibold text-white/70" numberOfLines={1}>
              {t("upNext.tripDay", { trip: trip.title, day: day.dayNumber })}
              {day.date ? `, ${f.day(day.date)}` : ""}
            </Text>
            <Text className="text-[28px] font-extrabold leading-8 text-white" numberOfLines={2}>
              {activity.title}
            </Text>
            <Text className="text-sm text-white/75" numberOfLines={1}>
              {[f.time(activity.startTime), `${badge.emoji} ${badge.text}`, activity.durationMinutes ? f.duration(activity.durationMinutes) : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {step && (
              <View className="mt-1 flex-row self-start rounded-2xl bg-white/10 px-3 py-2">
                <Text className="text-sm text-white/60">{t("mobileUpNext.nextStep")} </Text>
                <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                  {step.title}
                </Text>
              </View>
            )}
          </Animated.View>

          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" variant="light" icon="check" onPress={markDone}>
              {step ? t("mobileUpNext.stepDone") : t("upNext.markDone")}
            </Button>
            <Button size="sm" variant="glass" icon="directions" onPress={() => void openDirections(activity)}>
              {t("upNext.directions")}
            </Button>
            {next.startsInDays <= 0 && (
              <Button size="sm" variant="glass" icon="sun" onPress={() => router.push({ pathname: "/trips/[tripId]/today", params: { tripId: trip._id } })}>
                {t("today.title")}
              </Button>
            )}
          </View>

          <View className="gap-2">
            <View className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <Animated.View
                className="absolute bottom-0 left-0 top-0 rounded-full bg-emerald-300"
                style={{ width: `${pct}%`, transitionProperty: "width", transitionDuration: 400, transitionTimingFunction: CSS_EASE_OUT }}
              />
            </View>
            <Text className="text-xs text-white/60">
              {t("mobileUpNext.progress", { done: day.done, total: day.total, day: day.dayNumber })}
              {later[0] ? ` · ${t("mobileUpNext.then", { title: later[0].activity.title })}` : ""}
            </Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/**
 * trips.upNext, but with check-offs still waiting in the outbox applied: the
 * server can't know about them yet, so it's worked out again here from the
 * saved trips (the same pickUpNext the server uses).
 */
function useUpNextWithPending(today: string): UpNextData | null | undefined {
  const server = useCachedQuery(api.trips.upNext, { today }).data;
  const trips = useCachedQuery(api.trips.list, {}).data;
  const { queue } = useOutbox();
  return useMemo(() => {
    if (!trips || !queue.some((op) => op.kind === "activity")) return server;
    for (const t of trips.filter((t) => t.endDate >= today)) {
      const saved = readCache<TripDetails | null>(cacheKey(api.trips.get, { tripId: t._id }));
      // A trip that was never opened or prefetched: the server's answer is the best there is.
      if (!saved) return server;
      const next = pickUpNext(applyPendingToTrip(saved, queue), today);
      if (next) return next;
    }
    return null;
  }, [server, trips, queue, today]);
}
