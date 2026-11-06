import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { toLocalPickArgs, type LocalPickProposal } from "@trip/backend/localPick";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/button";
import { PressableScale } from "@/components/pressable-scale";
import { EASE_OUT } from "@/lib/motion";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : fallback);

/**
 * Sheet: "local's pick" for one day. The AI proposes swapping tourist-heavy
 * stops for places locals love; nothing changes until "Use local's picks", and
 * it can be switched back to the original plan. Also adds tips without swapping.
 */
export function LocalPick({ tripId, subTripId }: { tripId: Id<"trips">; subTripId: Id<"subTrips"> }) {
  const trip = useQuery(api.trips.get, { tripId });
  const day = trip?.subTrips.find((d) => d._id === subTripId);
  const pick = useAction(api.ai.localPickDay);
  const addTips = useAction(api.ai.addLocalTips);
  const apply = useMutation(api.localPicks.apply);
  const restore = useMutation(api.localPicks.restore);
  const router = useRouter();
  const { t, f, locale, category } = useI18n();
  const [busy, setBusy] = useState<"thinking" | "tips" | "applying" | "restoring" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposal, setProposal] = useState<LocalPickProposal | null>(null);
  if (!day) return <ActivityIndicator className="mt-10" />;

  const on = Boolean(day.localPickAt);
  const missingTips = day.activities.some((a) => !a.localTips?.length);
  const run = async <T,>(kind: NonNullable<typeof busy>, task: () => Promise<T>) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      return await task();
    } catch (e) {
      setError(errorText(e, t("common.somethingWrong")));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  const keptIds = new Set(proposal?.activities.flatMap((a) => ("keepId" in a ? [a.keepId] : [])));
  const removed = proposal ? day.activities.filter((a) => !keptIds.has(a._id)) : [];

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12">
      <Text className="text-lg font-bold text-foreground">{`💎 ${t("local.title", { day: day.dayNumber })}`}</Text>
      <Text className="-mt-2 text-sm leading-5 text-muted-foreground">{t("local.intro")}</Text>

      {on && (
        <View className="flex-row items-center gap-3 rounded-2xl bg-violet-600/10 p-3">
          <Text className="flex-1 text-sm font-semibold text-violet-700 dark:text-violet-300">{t("local.on")}</Text>
          <PressableScale
            disabled={busy !== null}
            onPress={async () => {
              const done = await run("restoring", async () => {
                await restore({ subTripId });
                return true;
              });
              if (done) {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.back();
              }
            }}
            className="rounded-full bg-card px-3 py-1.5"
          >
            <Text className="text-sm font-semibold text-foreground">{busy === "restoring" ? t("local.undoing") : `↩ ${t("local.undo")}`}</Text>
          </PressableScale>
        </View>
      )}

      <PressableScale
        disabled={busy !== null}
        onPress={async () => {
          setProposal(null);
          const next = await run("thinking", () => pick({ subTripId, language: locale }));
          if (next) {
            setProposal(next);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }}
        accessibilityRole="button"
        className={cn("flex-row items-center justify-center gap-2 rounded-full bg-violet-600 py-3.5", busy !== null && "opacity-60")}
      >
        {busy === "thinking" && <ActivityIndicator color="white" />}
        <Text className="text-base font-semibold text-white">{busy === "thinking" ? t("local.thinking") : proposal ? t("common.retry") : `💎 ${t("local.find")}`}</Text>
      </PressableScale>
      {missingTips && !proposal && (
        <Button
          variant="secondary"
          loading={busy === "tips"}
          disabled={busy !== null}
          onPress={async () => {
            const count = await run("tips", () => addTips({ subTripId, language: locale }));
            if (count !== undefined) {
              setNotice(count > 0 ? t("local.tipsAdded", { count }) : t("local.noTips"));
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }}
        >
          {busy === "tips" ? t("local.addingTips") : `💡 ${t("local.addTips")}`}
        </Button>
      )}
      {error && <Text className="text-sm text-danger">{error}</Text>}
      {notice && <Text className="rounded-2xl bg-success/10 p-3 text-sm font-semibold text-success">{`✓ ${notice}`}</Text>}

      {proposal && busy !== "thinking" && (
        <Animated.View entering={FadeIn.duration(240).easing(EASE_OUT)} className="gap-2">
          <Text className="rounded-2xl bg-violet-600/10 p-3 text-sm text-foreground">{proposal.summary}</Text>
          {proposal.activities.map((a, i) => {
            const isNew = !("keepId" in a);
            return (
              <Animated.View
                key={i}
                entering={FadeInDown.delay(i * 40).duration(220).easing(EASE_OUT)}
                className={cn("gap-0.5 rounded-2xl px-4 py-3", isNew ? "border border-violet-500/40 bg-violet-600/5" : "bg-card")}
              >
                <View className="flex-row items-center gap-3">
                  <Text className="w-16 text-sm font-semibold text-muted-foreground">{f.time(a.startTime)}</Text>
                  <Text className="flex-1 font-semibold text-foreground" numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text className={cn("text-xs font-semibold", isNew ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground")}>
                    {isNew ? `💎 ${category(a.category, a.subcategory).emoji}` : t("replan.kept")}
                  </Text>
                </View>
                {isNew && a.replaces ? (
                  <Text className="pl-[76px] text-xs text-muted-foreground" numberOfLines={1}>
                    {t("local.replaces", { title: a.replaces })}
                  </Text>
                ) : null}
              </Animated.View>
            );
          })}
          {removed.length > 0 && <Text className="text-xs text-muted-foreground">{t("replan.removed", { titles: removed.map((r) => r.title).join(", ") })}</Text>}
          <View className="mt-2 flex-row gap-2">
            <Button variant="secondary" containerClassName="flex-1" onPress={() => router.back()}>
              {t("local.keepMine")}
            </Button>
            <Button
              containerClassName="flex-1"
              loading={busy === "applying"}
              disabled={busy !== null}
              onPress={async () => {
                const done = await run("applying", async () => {
                  await apply({ subTripId, activities: toLocalPickArgs(proposal) });
                  return true;
                });
                if (done) {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  router.back();
                }
              }}
            >
              {t("local.usePicks")}
            </Button>
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}
