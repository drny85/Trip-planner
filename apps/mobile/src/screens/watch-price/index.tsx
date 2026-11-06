import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { Button } from "@/components/button";
import { Field } from "@/components/form";

/** Sheet for starting or changing the daily price watch on a flight or hotel booking. */
export function WatchPrice({ tripId, bookingId }: { tripId: Id<"trips">; bookingId: Id<"bookings"> }) {
  const alerts = useQuery(api.alerts.forTrip, { tripId });
  if (!alerts) return <ActivityIndicator className="mt-10" />;
  return <WatchForm alerts={alerts} bookingId={bookingId} />;
}

type Alerts = NonNullable<FunctionReturnType<typeof api.alerts.forTrip>>;

function WatchForm({ alerts, bookingId }: { alerts: Alerts; bookingId: Id<"bookings"> }) {
  const { t, f, locale } = useI18n();
  const router = useRouter();
  const watchPrice = useMutation(api.alerts.watchPrice);
  const parsed = alerts.watchable.find((w) => w.bookingId === bookingId);
  const watch = alerts.watches.find((w) => w.bookingId === bookingId);
  const isFlight = parsed?.kind !== "hotel";
  const [from, setFrom] = useState(watch?.from ?? parsed?.from ?? "");
  const [to, setTo] = useState(watch?.to ?? parsed?.to ?? "");
  const [paid, setPaid] = useState(watch?.paidCents ? String(watch.paidCents / 100) : "");
  const [adults, setAdults] = useState(String(watch?.adults ?? (isFlight ? alerts.travelers : Math.min(alerts.travelers, 2) || 2)));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const paidCents = Math.round(parseFloat(paid.replace(",", ".")) * 100);
    setSaving(true);
    try {
      await watchPrice({
        bookingId,
        from: isFlight ? from : undefined,
        to: isFlight ? to : undefined,
        paidCents: paidCents > 0 ? paidCents : undefined,
        adults: Number(adults) || undefined,
        language: locale,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert(t("alerts.couldntWatch"), e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : undefined);
      setSaving(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12" keyboardShouldPersistTaps="handled">
      <Text className="text-sm text-muted-foreground">{t("alerts.watchIntro")}</Text>
      {!alerts.pricesEnabled && <Text className="text-sm font-semibold text-muted-foreground">📉 {t("alerts.pricesOff")}</Text>}
      {isFlight && (
        <View className="gap-1.5">
          <View className="flex-row gap-3">
            <Field
              className="flex-1"
              label={t("alerts.from")}
              value={from}
              onChangeText={(v) => setFrom(v.toUpperCase())}
              maxLength={3}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="SFO"
            />
            <Field className="flex-1" label={t("alerts.to")} value={to} onChangeText={(v) => setTo(v.toUpperCase())} maxLength={3} autoCapitalize="characters" autoCorrect={false} placeholder="NRT" />
          </View>
          <Text className="text-xs text-muted-foreground">{t("alerts.airportHint")}</Text>
        </View>
      )}
      <View className="gap-1.5">
        <Field label={t("alerts.paid", { currency: f.currencySymbol(alerts.currency) })} value={paid} onChangeText={setPaid} keyboardType="decimal-pad" placeholder="0" />
        <Text className="text-xs text-muted-foreground">{t("alerts.paidHint")}</Text>
      </View>
      <Field label={isFlight ? t("alerts.travelers") : t("alerts.guests")} value={adults} onChangeText={(v) => setAdults(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={1} />
      <Button onPress={() => void submit()} loading={saving} icon="bell" className="mt-2">
        {watch ? t("alerts.save") : t("alerts.start")}
      </Button>
    </ScrollView>
  );
}
