import { useI18n } from "@trip/i18n/react";
import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { groupPacking, PACKING_EMOJI } from "@trip/backend/packing";
import { cn } from "@trip/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Button } from "@/components/button";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { CSS_EASE_OUT, EASE_IN_OUT, EASE_OUT } from "@/lib/motion";

type AiState = { status: "idle" } | { status: "working" } | { status: "done"; added: number } | { status: "error"; message: string };

/** The group's shared packing list: tick items off, or claim one to bring for everyone. */
export function PackingSection({ tripId }: { tripId: Id<"trips"> }) {
  const items = useCachedQuery(api.packing.list, { tripId }).data;
  const lastRun = useQuery(api.packing.lastRun, { tripId });
  const generate = useAction(api.ai.generatePackingList);
  const [ai, setAi] = useState<AiState>({ status: "idle" });
  const add = useMutation(api.packing.add);
  const addEssentials = useMutation(api.packing.addEssentials);
  const toggle = useMutation(api.packing.toggle);
  const claim = useMutation(api.packing.claim);
  const remove = useMutation(api.packing.remove);
  const [text, setText] = useState("");
  const { t, locale } = useI18n();
  if (!items) return null;

  const packed = items.filter((i) => i.isPacked).length;
  const sections = groupPacking(items);
  const grouped = sections.length > 1 || sections[0]?.key !== "none";
  const hasAi = items.some((i) => i.isAi);
  const weather = lastRun?.weather;
  const weatherLine = weather
    ? [
        t(weather.source === "forecast" ? "packing.weatherForecast" : "packing.weatherTypical", { low: weather.low, high: weather.high }),
        weather.rainyDays > 0 && t("packing.rainDays", { count: weather.rainyDays }),
        weather.snowyDays > 0 && t("packing.snowDays", { count: weather.snowyDays }),
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const status =
    ai.status === "working"
      ? t("packing.aiWorking")
      : ai.status === "error"
        ? ai.message
        : ai.status === "done"
          ? ai.added
            ? t("packing.aiAdded", { count: ai.added })
            : t("packing.aiNothingNew")
          : hasAi
            ? null
            : t("packing.aiHint");

  const packWithAi = async () => {
    setAi({ status: "working" });
    try {
      const result = await generate({ tripId, language: locale });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAi({ status: "done", added: result.added });
    } catch (e) {
      setAi({ status: "error", message: e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : t("packing.aiFailed") });
    }
  };
  const submit = () => {
    if (!text.trim()) return;
    void add({ tripId, text });
    setText("");
  };

  return (
    <View className="mt-10 gap-3 px-4">
      <View className="flex-row items-end justify-between">
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">{t("packing.eyebrow")}</Text>
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">{t("packing.title")}</Text>
          <Text className="text-xs text-muted-foreground">
            {items.length ? t("mobileMoney.packedShared", { done: packed, total: items.length }) : t("mobileMoney.sharedWithEveryone")}
          </Text>
        </View>
        <Button size="sm" variant="secondary" icon="plus" onPress={() => void addEssentials({ tripId, language: locale })}>
          {t("mobileMoney.essentials")}
        </Button>
      </View>

      <Button icon="sparkles" loading={ai.status === "working"} onPress={() => void packWithAi()}>
        {hasAi ? t("packing.aiMore") : t("packing.aiButton")}
      </Button>
      {(status || (weatherLine && ai.status !== "working")) && (
        <Animated.View key={ai.status} entering={FadeIn.duration(200).easing(EASE_OUT)} className="gap-1.5">
          {status && (
            <Text accessibilityLiveRegion="polite" className={cn("text-sm", ai.status === "error" ? "text-danger" : "text-muted-foreground")}>
              {status}
            </Text>
          )}
          {weatherLine && ai.status !== "working" && ai.status !== "error" && (
            <View className="self-start rounded-full bg-muted px-3 py-1">
              <Text className="text-xs font-medium text-foreground">
                {weather!.snowyDays ? "❄️" : weather!.rainyDays ? "🌧️" : "🌤️"} {weatherLine}
              </Text>
            </View>
          )}
        </Animated.View>
      )}

      <View className="rounded-3xl bg-card px-4 py-2 shadow-sm shadow-black/5">
        {sections.map((section) => (
          <View key={section.key}>
            {grouped && (
              <Text className="pt-3 pb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {section.key === "none" ? "✍️" : PACKING_EMOJI[section.key]} {t(`packing.category.${section.key}`)}
              </Text>
            )}
            {section.items.map((item) => (
              <Animated.View
                key={item._id}
                entering={FadeIn.duration(200).easing(EASE_OUT)}
                exiting={FadeOut.duration(150)}
                layout={LinearTransition.duration(240).easing(EASE_IN_OUT)}
                className="flex-row items-center gap-3 border-b border-border/60 py-3"
              >
                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    void toggle({ itemId: item._id, isPacked: !item.isPacked });
                  }}
                  onLongPress={() =>
                    Alert.alert(item.text, item.reason, [
                      { text: t("common.cancel"), style: "cancel" },
                      { text: t("common.remove"), style: "destructive", onPress: () => void remove({ itemId: item._id }) },
                    ])
                  }
                  hitSlop={6}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.isPacked }}
                  accessibilityHint={item.reason}
                  className="flex-1 flex-row items-center gap-3"
                >
                  <Animated.View
                    className={cn("h-6 w-6 items-center justify-center rounded-lg border-2", item.isPacked ? "border-success bg-success" : "border-border")}
                    style={{ transitionProperty: ["backgroundColor", "borderColor"], transitionDuration: 180, transitionTimingFunction: CSS_EASE_OUT }}
                  >
                    {item.isPacked && <Text className="text-xs font-bold text-white">✓</Text>}
                  </Animated.View>
                  <View className="flex-1">
                    <Text className={cn("text-base text-foreground", item.isPacked && "text-muted-foreground line-through")} numberOfLines={1}>
                      {item.text}
                      {item.quantity ? <Text className="text-sm font-semibold text-muted-foreground"> {t("packing.quantity", { count: item.quantity })}</Text> : null}
                      {item.isAi ? <Text className="text-xs"> ✨</Text> : null}
                    </Text>
                    {item.reason && !item.isPacked ? (
                      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                        {item.reason}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => void claim({ itemId: item._id })}
                  hitSlop={8}
                  className={cn(
                    "rounded-full px-2.5 py-1",
                    item.claimedBy?.isMe ? "bg-primary/10" : item.isGroupItem && !item.claimedBy ? "border border-dashed border-primary/40" : "bg-muted",
                  )}
                >
                  <Text className={cn("text-xs font-semibold", item.claimedBy?.isMe || (item.isGroupItem && !item.claimedBy) ? "text-primary" : "text-muted-foreground")}>
                    {item.claimedBy ? (item.claimedBy.isMe ? t("split.you") : item.claimedBy.name.split(" ")[0]) : t("mobileMoney.illBring")}
                  </Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        ))}
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="done"
          submitBehavior="submit"
          maxLength={120}
          placeholder={items.length ? t("packing.addPlaceholder") : t("mobileMoney.addItemPlaceholder")}
          className="py-3 text-base text-foreground placeholder:text-muted-foreground"
        />
      </View>
    </View>
  );
}
