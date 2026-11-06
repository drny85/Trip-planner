import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/button";
import { EASE_OUT } from "@/lib/motion";

type Plan = FunctionReturnType<typeof api.groupVotes.buildPlan>;

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : fallback);

/** Sheet: the AI rebuilds the plan around the group's votes; preview it, then apply or keep the old one. */
export function GroupPlan({ tripId }: { tripId: Id<"trips"> }) {
  const trip = useQuery(api.trips.get, { tripId });
  const build = useAction(api.groupVotes.buildPlan);
  const apply = useMutation(api.groupVotes.applyPlan);
  const router = useRouter();
  const { t, f, locale } = useI18n();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<"building" | "applying" | null>("building");
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setBusy("building");
    setError(null);
    try {
      setPlan(await build({ tripId, language: locale }));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(errorText(e, t("common.somethingWrong")));
    } finally {
      setBusy(null);
    }
  };
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  if (!trip) return <ActivityIndicator className="mt-10" />;
  const titles = new Map(trip.subTrips.flatMap((d) => d.activities.map((a) => [a._id as string, a.title] as const)));
  const dayNumber = new Map(trip.subTrips.map((d) => [d._id as string, d.dayNumber]));
  const unchanged =
    plan !== null &&
    plan.dropped.length === 0 &&
    plan.days.every((d) => {
      const now = trip.subTrips.find((s) => s._id === d.subTripId)?.activities.map((a) => a._id) ?? [];
      return d.items.length === now.length && d.items.every((i, n) => i.activityId === now[n] && !i.movedFrom);
    });

  const onApply = async () => {
    if (!plan) return;
    setBusy("applying");
    try {
      await apply({
        tripId,
        days: plan.days.map((d) => ({ subTripId: d.subTripId as Id<"subTrips">, items: d.items.map((i) => ({ activityId: i.activityId as Id<"activities">, startTime: i.startTime })) })),
        drop: plan.dropped.map((d) => d.activityId as Id<"activities">),
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(errorText(e, t("common.somethingWrong")));
      setBusy(null);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12">
      {busy === "building" && (
        <View className="items-center gap-3 py-10">
          <ActivityIndicator />
          <Text className="text-sm text-muted-foreground">{t("groupVote.building")}</Text>
        </View>
      )}
      {error && (
        <View className="gap-3">
          <Text className="text-sm text-danger">{error}</Text>
          <Button variant="secondary" onPress={() => void ask()}>
            {t("common.retry")}
          </Button>
        </View>
      )}

      {plan && busy !== "building" && (
        <Animated.View entering={FadeIn.duration(240).easing(EASE_OUT)} className="gap-3">
          <Text className="rounded-2xl bg-amber-500/10 p-3 text-sm text-foreground">{plan.summary ?? t("groupVote.votesOnly")}</Text>
          {unchanged ? (
            <Text className="rounded-2xl bg-muted p-4 text-sm text-foreground">{t("groupVote.noChanges")}</Text>
          ) : (
            <>
              {plan.days.map((d) => (
                <View key={d.subTripId} className="gap-1.5">
                  <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("time.dayN", { day: dayNumber.get(d.subTripId) ?? "?" })}</Text>
                  {d.items.map((i, n) => (
                    <Animated.View
                      key={i.activityId}
                      entering={FadeInDown.delay(n * 30).duration(200).easing(EASE_OUT)}
                      className={cn("flex-row items-center gap-3 rounded-2xl px-4 py-3", i.movedFrom ? "bg-amber-500/10" : "bg-card")}
                    >
                      <Text className="w-16 text-sm font-semibold text-muted-foreground">{i.startTime ? f.time(i.startTime) : ""}</Text>
                      <View className="flex-1">
                        <Text className="font-semibold text-foreground" numberOfLines={1}>
                          {titles.get(i.activityId) ?? "…"}
                        </Text>
                        {i.movedFrom && (
                          <Text className="text-xs font-semibold text-amber-500">{t("groupVote.movedFrom", { day: t("time.dayN", { day: dayNumber.get(i.movedFrom) ?? "?" }) })}</Text>
                        )}
                      </View>
                    </Animated.View>
                  ))}
                </View>
              ))}
              {plan.dropped.length > 0 && (
                <View className="gap-1.5">
                  <Text className="text-[11px] font-semibold uppercase tracking-widest text-danger">{t("groupVote.leavingOut")}</Text>
                  {plan.dropped.map((d) => (
                    <View key={d.activityId} className="rounded-2xl bg-danger/10 px-4 py-3">
                      <Text className="font-semibold text-foreground line-through" numberOfLines={1}>
                        {titles.get(d.activityId) ?? "…"}
                      </Text>
                      <Text className="text-xs text-muted-foreground">{d.reason ?? t("groupVote.votedDown")}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
          <View className="mt-2 flex-row gap-2">
            <Button variant="secondary" containerClassName="flex-1" onPress={() => router.back()}>
              {t("groupVote.keep")}
            </Button>
            {!unchanged && (
              <Button containerClassName="flex-1" loading={busy === "applying"} onPress={() => void onApply()}>
                {t("groupVote.apply")}
              </Button>
            )}
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}
