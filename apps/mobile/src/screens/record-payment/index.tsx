import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { parseAmount } from "@trip/backend/settle";
import { amountText } from "@trip/backend/splitDraft";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text } from "react-native";
import { Button } from "@/components/button";
import { Field } from "@/components/form";
import { splitErrorMessage, useSplitText, type SplitData } from "@/screens/trip-details/split-costs";

/** Sheet for recording that one person paid another back, in full or in part. */
export function RecordPayment({ tripId, from, to }: { tripId: Id<"trips">; from: string; to: string }) {
  const data = useQuery(api.expenses.forTrip, { tripId });
  if (!data) return <ActivityIndicator className="mt-10" />;
  const suggested = data.transfers.find((tr) => tr.from === from && tr.to === to);
  return <PaymentForm tripId={tripId} data={data} from={from} to={to} maxCents={suggested?.amountCents ?? 0} />;
}

function PaymentForm({ tripId, data, from, to, maxCents }: { tripId: Id<"trips">; data: SplitData; from: string; to: string; maxCents: number }) {
  const record = useMutation(api.expenses.recordPayment);
  const router = useRouter();
  const { t, money, nameOf } = useSplitText(data);
  const [amount, setAmount] = useState(maxCents > 0 ? amountText(maxCents) : "");
  const [saving, setSaving] = useState(false);
  const cents = parseAmount(amount);
  const me = data.me;
  const label = from === me ? t("split.youPay", { to: nameOf(to) }) : to === me ? t("split.paysYou", { from: nameOf(from) }) : t("split.pays", { from: nameOf(from), to: nameOf(to) });

  const submit = async () => {
    if (cents == null || cents <= 0) return Alert.alert(t("mobileSheets.enterAmount"));
    setSaving(true);
    try {
      await record({ tripId, from, to, amountCents: cents });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert(splitErrorMessage(t, e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12" keyboardShouldPersistTaps="handled">
      <Text className="text-lg font-bold text-foreground">{label}</Text>
      <Field label={t("split.amount", { currency: data.currency })} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" autoFocus />
      <Text className="text-sm text-muted-foreground">{maxCents > 0 ? t("split.upTo", { amount: money(maxCents) }) : t("split.errors.nothingOwed")}</Text>
      <Button onPress={() => void submit()} loading={saving} disabled={maxCents === 0 || cents == null || cents > maxCents} className="mt-2">
        {t("split.confirm")}
      </Button>
    </ScrollView>
  );
}
