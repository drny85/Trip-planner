import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { toApplyArgs } from "@trip/backend/replan";
import { categoryLabel, cn, formatTime } from "@trip/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/button";
import { EASE_OUT } from "@/lib/motion";
import { useDayWeather } from "@/screens/trip-details/day-weather";

type Proposal = FunctionReturnType<typeof api.ai.replanDay>;

const REASONS = [
  { label: "🌧️ Rain", text: "It's going to rain, so move us indoors" },
  { label: "😴 Lighter day", text: "We're tired: make it a slower, lighter day" },
  { label: "🍜 More food", text: "Fit in more great local food" },
  { label: "👨‍👩‍👧 Kids", text: "Make it friendly for kids" },
];

/**
 * Sheet: ask the AI to re-plan one day, preview it, then apply or keep the old plan.
 * From today mode: `initialReason` starts the re-plan right away, and `now` keeps it to what's still ahead. */
export function ReplanDay({ tripId, subTripId, initialReason, now }: { tripId: Id<"trips">; subTripId: Id<"subTrips">; initialReason?: string; now?: string }) {
  const trip = useQuery(api.trips.get, { tripId });
  const day = trip?.subTrips.find((d) => d._id === subTripId);
  const weather = useDayWeather(day?.date, day?.activities ?? []);
  const replan = useAction(api.ai.replanDay);
  const apply = useMutation(api.activities.applyReplan);
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(initialReason ?? null);
  const [busy, setBusy] = useState<"thinking" | "applying" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const rainy = (weather?.rainChance ?? 0) >= 50;
  const why = reason ?? (rainy ? REASONS[0]!.text : "");
  const ask = async (text = why) => {
    setBusy("thinking");
    setError(null);
    try {
      setProposal(await replan({ subTripId, reason: text, now, weather: weather ? { label: weather.label, high: weather.high, low: weather.low, rainChance: weather.rainChance } : undefined }));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };
  // One tap from today mode: ask as soon as the day has loaded.
  const asked = useRef(false);
  useEffect(() => {
    if (!initialReason || !day || asked.current) return;
    asked.current = true;
    void ask(initialReason);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the day is ready
  }, [day?._id]);
  if (!day) return <ActivityIndicator className="mt-10" />;

  const keptIds = new Set(proposal?.activities.flatMap((a) => ("keepId" in a ? [a.keepId] : [])));
  const removed = proposal ? day.activities.filter((a) => !keptIds.has(a._id)) : [];

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12" keyboardShouldPersistTaps="handled">
      <Text className="text-sm text-muted-foreground">
        {weather ? `${weather.emoji} ${weather.label}, ${weather.rainChance}% chance of rain. ` : ""}Day {day.dayNumber}: tell the AI what to change. Nothing changes until you apply it.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {REASONS.map((r) => {
          const on = why === r.text;
          return (
            <Pressable key={r.label} onPress={() => setReason(r.text)} className={cn("rounded-full border px-3 py-1.5", on ? "border-primary bg-primary" : "border-border bg-card")}>
              <Text className={cn("text-sm font-semibold", on ? "text-primary-foreground" : "text-foreground")}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={why}
        onChangeText={setReason}
        maxLength={300}
        multiline
        placeholder="Or say it your way…"
        className="min-h-16 rounded-xl border border-border bg-card px-3 py-2.5 text-base text-foreground"
        textAlignVertical="top"
      />
      <Button icon="sparkles" loading={busy === "thinking"} onPress={() => void ask()} disabled={!why.trim()}>
        {proposal ? "Try again" : "Re-plan"}
      </Button>
      {error && <Text className="text-sm text-danger">{error}</Text>}

      {proposal && busy !== "thinking" && (
        <Animated.View entering={FadeIn.duration(240).easing(EASE_OUT)} className="gap-2">
          <Text className="rounded-2xl bg-primary/10 p-3 text-sm text-foreground">{proposal.summary}</Text>
          {proposal.activities.map((a, i) => {
            const isNew = !("keepId" in a);
            return (
              <Animated.View key={i} entering={FadeInDown.delay(i * 40).duration(220).easing(EASE_OUT)} className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3">
                <Text className="w-16 text-sm font-semibold text-muted-foreground">{formatTime(a.startTime)}</Text>
                <Text className="flex-1 font-semibold text-foreground" numberOfLines={1}>
                  {a.title}
                </Text>
                <Text className={cn("text-xs font-semibold", isNew ? "text-success" : "text-muted-foreground")}>
                  {isNew ? `New ${categoryLabel(a.category, a.subcategory).emoji}` : "Kept"}
                </Text>
              </Animated.View>
            );
          })}
          {removed.length > 0 && <Text className="text-xs text-muted-foreground">Removed: {removed.map((r) => r.title).join(", ")}. Stops with photos are never removed.</Text>}
          <View className="mt-2 flex-row gap-2">
            <Button variant="secondary" containerClassName="flex-1" onPress={() => router.back()}>
              Keep mine
            </Button>
            <Button
              containerClassName="flex-1"
              loading={busy === "applying"}
              onPress={async () => {
                setBusy("applying");
                await apply({ subTripId, activities: toApplyArgs(proposal) });
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.back();
              }}
            >
              Use this plan
            </Button>
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}
