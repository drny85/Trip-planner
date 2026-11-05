import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Button } from "@/components/button";
import { Chips, Field } from "@/components/form";

/** Sheet for logging something one person paid for the group. */
export function AddExpense({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.expenses.forTrip, { tripId });
  const add = useMutation(api.expenses.add);
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [among, setAmong] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const { t, f } = useI18n();
  if (!data) return <ActivityIndicator className="mt-10" />;

  const payer = paidBy ?? data.members.find((m) => m.isMe)?.userId ?? data.members[0]!.userId;
  const split = among ?? data.members.map((m) => m.userId);
  const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
  const label = (m: (typeof data.members)[number]) => (m.isMe ? t("split.you") : m.name.split(" ")[0]!);

  const submit = async () => {
    if (!(cents > 0)) return Alert.alert(t("mobileSheets.enterAmount"));
    if (split.length === 0) return Alert.alert(t("mobileSheets.pickSplit"));
    setSaving(true);
    try {
      await add({ tripId, description, amountCents: cents, paidBy: payer, splitAmong: split });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert(t("split.couldntAdd"), e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12" keyboardShouldPersistTaps="handled">
      <Field label={t("split.whatWasIt")} value={description} onChangeText={setDescription} placeholder={t("split.whatPlaceholder")} maxLength={80} autoFocus />
      <Field label={t("split.amount", { currency: data.currency })} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("split.paidBy")}</Text>
        <Chips options={data.members.map((m) => ({ value: m.userId, label: label(m) }))} selected={payer} onSelect={setPaidBy} />
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("split.splitBetween")}</Text>
        <View className="flex-row flex-wrap gap-2">
          {data.members.map((m) => {
            const on = split.includes(m.userId);
            return (
              <Pressable
                key={m.userId}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setAmong(on ? split.filter((x) => x !== m.userId) : [...split, m.userId])}
                className={cn("rounded-full border px-3 py-1.5", on ? "border-primary bg-primary" : "border-border bg-card")}
              >
                <Text className={cn("text-sm font-semibold", on ? "text-primary-foreground" : "text-foreground")}>{label(m)}</Text>
              </Pressable>
            );
          })}
        </View>
        {cents > 0 && split.length > 0 && <Text className="text-sm text-muted-foreground">{t("split.each", { amount: f.money(cents / 100 / split.length, data.currency) })}</Text>}
      </View>
      <Button onPress={() => void submit()} loading={saving} icon="plus" className="mt-2">
        {t("split.addExpense")}
      </Button>
    </ScrollView>
  );
}
