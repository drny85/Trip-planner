import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Button } from "@/components/button";
import { EASE_IN_OUT, EASE_OUT } from "@/lib/motion";

/** The group's shared costs: your balance, who pays whom, and recent expenses. */
export function SplitCostsSection({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.expenses.forTrip, { tripId });
  const settle = useMutation(api.expenses.settle);
  const remove = useMutation(api.expenses.remove);
  const router = useRouter();
  const { t, f } = useI18n();
  if (!data) return null;
  const money = (cents: number) => f.money(cents / 100, data.currency);
  const mine = data.myBalanceCents;
  const meId = data.members.find((m) => m.isMe)?.userId;
  const nameOf = (id: string, name: string) => (id === meId ? t("split.you") : name === "Former member" ? t("split.formerMember") : name);

  return (
    <View className="mt-10 gap-3 px-4">
      <View className="flex-row items-end justify-between">
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">{t("split.eyebrow")}</Text>
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">{t("split.title")}</Text>
          <Text className="text-xs text-muted-foreground">
            {data.totalCents > 0 ? t("mobileMoney.sharedSoFar", { amount: money(data.totalCents) }) : t("mobileMoney.logHint")}
          </Text>
        </View>
        <Button size="sm" icon="plus" onPress={() => router.push({ pathname: "/trips/[tripId]/expense", params: { tripId } })}>
          {t("mobileMoney.expense")}
        </Button>
      </View>

      <View className={cn("rounded-3xl p-4", mine > 0 ? "bg-success/10" : mine < 0 ? "bg-danger/10" : "bg-card")}>
        <Text className="text-xs text-muted-foreground">{t("split.yourBalance")}</Text>
        <Text className={cn("text-xl font-bold", mine > 0 ? "text-success" : mine < 0 ? "text-danger" : "text-foreground")}>
          {mine === 0 ? t("split.allSquare") : mine > 0 ? t("split.youreOwed", { amount: money(mine) }) : t("split.youOwe", { amount: money(-mine) })}
        </Text>
        {data.transfers.map((tr) => (
          <Animated.View key={`${tr.from}-${tr.to}`} entering={FadeIn.duration(200).easing(EASE_OUT)} exiting={FadeOut.duration(150)} className="mt-3 flex-row items-center gap-2">
            <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
              <Text className="font-semibold">{nameOf(tr.from, tr.fromName)}</Text> → <Text className="font-semibold">{nameOf(tr.to, tr.toName)}</Text>
            </Text>
            <Text className="text-sm font-bold text-foreground">{money(tr.amountCents)}</Text>
            {tr.involvesMe && (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  void settle({ tripId, from: tr.from, to: tr.to, amountCents: tr.amountCents });
                }}
                className="rounded-full bg-primary/15 px-2.5 py-1"
              >
                <Text className="text-xs font-semibold text-primary">{t("mobileMoney.paid")}</Text>
              </Pressable>
            )}
          </Animated.View>
        ))}
      </View>

      {data.expenses.slice(0, 8).map((e) => (
        <Animated.View key={e._id} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={LinearTransition.duration(240).easing(EASE_IN_OUT)}>
          <Pressable
            onLongPress={() =>
              e.canDelete &&
              Alert.alert(e.description, undefined, [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("common.delete"), style: "destructive", onPress: () => void remove({ expenseId: e._id }) },
              ])
            }
            className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3"
          >
            <View className="flex-1">
              <Text className="font-semibold text-foreground" numberOfLines={1}>
                {e.isSettlement ? `🤝 ${t("split.paidBack", { from: nameOf(e.paidBy, e.paidByName), to: nameOf(e.splitAmong[0] ?? "", e.splitNames[0] ?? "") })}` : e.description}
              </Text>
              {!e.isSettlement && (
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {e.splitAmong.length === data.members.length
                    ? t("split.paidSplitEveryone", { name: nameOf(e.paidBy, e.paidByName) })
                    : t("split.paidSplitWith", { name: nameOf(e.paidBy, e.paidByName), names: e.splitAmong.map((id, i) => nameOf(id, e.splitNames[i] ?? "")).join(", ") })}
                </Text>
              )}
            </View>
            <Text className={cn("font-bold", e.isSettlement ? "text-muted-foreground" : "text-foreground")}>{money(e.amountCents)}</Text>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}
