import { api } from "@trip/backend/api";
import { categoryLabel, countdown, formatDay, formatDuration, formatTime, localToday } from "@trip/ui";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeInRight, FadeOutLeft, ReduceMotion } from "react-native-reanimated";
import { Button } from "@/components/button";
import { useToggleDone } from "@/components/undo-toast";
import { LinearGradient } from "@/components/gradient";
import { PressableScale } from "@/components/pressable-scale";
import { SmartImage } from "@/components/smart-image";
import { openDirections } from "@/lib/open";
import { CSS_EASE_OUT, EASE_OUT } from "@/lib/motion";
import { useCachedQuery } from "@/hooks/use-cached-query";

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
  const next = useCachedQuery(api.trips.upNext, { today }).data;
  const toggleDone = useToggleDone();
  const router = useRouter();
  if (!next) return null;

  const { trip, day, activity, step, later } = next;
  const badge = categoryLabel(activity.category, activity.subcategory);
  const target = step ?? activity;
  const pct = day.total ? Math.round((day.done / day.total) * 100) : 0;

  const markDone = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void toggleDone(target, true);
  };

  return (
    <Animated.View entering={FadeIn.duration(300).easing(EASE_OUT)}>
      <PressableScale
        accessibilityHint="Opens the trip"
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
              <Text className="text-[11px] font-bold uppercase tracking-widest text-white">Up next</Text>
            </View>
            <View className="rounded-full bg-white/10 px-3 py-1">
              <Text className="text-xs font-semibold text-white">{countdown(next.startsInDays, day.dayNumber)}</Text>
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
              {trip.title} · Day {day.dayNumber}
              {day.date ? `, ${formatDay(day.date)}` : ""}
            </Text>
            <Text className="text-[28px] font-extrabold leading-8 text-white" numberOfLines={2}>
              {activity.title}
            </Text>
            <Text className="text-sm text-white/75" numberOfLines={1}>
              {[formatTime(activity.startTime), `${badge.emoji} ${badge.text}`, activity.durationMinutes ? formatDuration(activity.durationMinutes) : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {step && (
              <View className="mt-1 flex-row self-start rounded-2xl bg-white/10 px-3 py-2">
                <Text className="text-sm text-white/60">Next step </Text>
                <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                  {step.title}
                </Text>
              </View>
            )}
          </Animated.View>

          <View className="flex-row gap-2">
            <Button size="sm" variant="light" icon="check" onPress={markDone}>
              {step ? "Step done" : "Mark done"}
            </Button>
            <Button size="sm" variant="glass" icon="directions" onPress={() => void openDirections(activity)}>
              Directions
            </Button>
          </View>

          <View className="gap-2">
            <View className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <Animated.View
                className="absolute bottom-0 left-0 top-0 rounded-full bg-emerald-300"
                style={{ width: `${pct}%`, transitionProperty: "width", transitionDuration: 400, transitionTimingFunction: CSS_EASE_OUT }}
              />
            </View>
            <Text className="text-xs text-white/60">
              {day.done} of {day.total} done on day {day.dayNumber}
              {later[0] ? ` · then ${later[0].activity.title}` : ""}
            </Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}
