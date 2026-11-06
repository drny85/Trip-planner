import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Button } from "@/components/button";
import { Field } from "@/components/form";

/** Sheet for starting or changing the fare watch on a trip the traveler hasn't booked a flight for. */
export function WatchFares({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.fares.forTrip, { tripId });
  if (!data) return <ActivityIndicator className="mt-10" />;
  return <Form data={data} tripId={tripId} />;
}

type Data = NonNullable<FunctionReturnType<typeof api.fares.forTrip>>;

function Form({ data, tripId }: { data: Data; tripId: Id<"trips"> }) {
  const { t, f, locale } = useI18n();
  const router = useRouter();
  const save = useMutation(api.fares.watch);
  const watch = data.watch;
  const [from, setFrom] = useState(watch?.from ?? data.homeAirport ?? "");
  const [to, setTo] = useState(watch?.to ?? data.suggestedTo ?? "");
  const [roundTrip, setRoundTrip] = useState(watch ? Boolean(watch.returnDate) : true);
  const [adults, setAdults] = useState(String(watch?.adults ?? 1));
  const [target, setTarget] = useState(watch?.targetCents ? String(watch.targetCents / 100) : "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const targetCents = Math.round(parseFloat(target.replace(",", ".")) * 100);
    setSaving(true);
    try {
      await save({ tripId, from, to, roundTrip, adults: Number(adults) || 1, targetCents: targetCents > 0 ? targetCents : undefined, language: locale });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert(t("fares.couldntWatch"), e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : undefined);
      setSaving(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12" keyboardShouldPersistTaps="handled">
      <Text className="text-sm text-muted-foreground">{t("fares.intro")}</Text>
      <Text className="text-sm font-semibold text-foreground">{f.dateRange(data.startDate, data.endDate)}</Text>
      {!data.enabled && <Text className="text-sm font-semibold text-muted-foreground">✈️ {t("fares.off")}</Text>}
      <View className="gap-1.5">
        <View className="flex-row gap-3">
          <Field className="flex-1" label={t("fares.from")} value={from} onChangeText={(v) => setFrom(v.toUpperCase())} maxLength={3} autoCapitalize="characters" autoCorrect={false} placeholder="SFO" />
          <Field className="flex-1" label={t("fares.to")} value={to} onChangeText={(v) => setTo(v.toUpperCase())} maxLength={3} autoCapitalize="characters" autoCorrect={false} placeholder="NRT" />
        </View>
        <Text className="text-xs text-muted-foreground">{t("fares.airportHint")}</Text>
      </View>
      <View className="flex-row rounded-full bg-muted p-1" accessibilityRole="radiogroup">
        {[true, false].map((rt) => (
          <Pressable
            key={String(rt)}
            onPress={() => setRoundTrip(rt)}
            accessibilityRole="radio"
            accessibilityState={{ checked: roundTrip === rt }}
            className={cn("flex-1 items-center rounded-full py-2", roundTrip === rt && "bg-card shadow-sm shadow-black/10")}
          >
            <Text className={cn("text-sm font-semibold", roundTrip === rt ? "text-foreground" : "text-muted-foreground")}>{rt ? t("fares.roundTrip") : t("fares.oneWay")}</Text>
          </Pressable>
        ))}
      </View>
      <Field label={t("fares.travelers")} value={adults} onChangeText={(v) => setAdults(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={1} />
      <View className="gap-1.5">
        <Field label={t("fares.target", { currency: f.currencySymbol(data.currency) })} value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0" />
        <Text className="text-xs text-muted-foreground">{t("fares.targetHint")}</Text>
      </View>
      <Button onPress={() => void submit()} loading={saving} icon="bell" className="mt-2">
        {watch ? t("fares.save") : t("fares.start")}
      </Button>
    </ScrollView>
  );
}
