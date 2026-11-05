import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { cn, formatMoney } from "@trip/ui";
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
  if (!data) return null;
  const money = (cents: number) => formatMoney(cents / 100, data.currency);
  const mine = data.myBalanceCents;

  return (
    <View className="mt-10 gap-3 px-4">
      <View className="flex-row items-end justify-between">
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">Fair and square</Text>
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">Split costs</Text>
          <Text className="text-xs text-muted-foreground">{money(data.totalCents)} spent by the group</Text>
        </View>
        <Button size="sm" icon="plus" onPress={() => router.push({ pathname: "/trips/[tripId]/expense", params: { tripId } })}>
          Expense
        </Button>
      </View>

      <View className={cn("rounded-3xl p-4", mine > 0 ? "bg-success/10" : mine < 0 ? "bg-danger/10" : "bg-card")}>
        <Text className="text-xs text-muted-foreground">Your balance</Text>
        <Text className={cn("text-xl font-bold", mine > 0 ? "text-success" : mine < 0 ? "text-danger" : "text-foreground")}>
          {mine === 0 ? "All square ✓" : mine > 0 ? `You're owed ${money(mine)}` : `You owe ${money(-mine)}`}
        </Text>
        {data.transfers.map((tr) => (
          <Animated.View key={`${tr.from}-${tr.to}`} entering={FadeIn.duration(200).easing(EASE_OUT)} exiting={FadeOut.duration(150)} className="mt-3 flex-row items-center gap-2">
            <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
              <Text className="font-semibold">{tr.fromName}</Text> → <Text className="font-semibold">{tr.toName}</Text>
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
                <Text className="text-xs font-semibold text-primary">Paid</Text>
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
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => void remove({ expenseId: e._id }) },
              ])
            }
            className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3"
          >
            <View className="flex-1">
              <Text className="font-semibold text-foreground" numberOfLines={1}>
                {e.isSettlement ? `🤝 ${e.paidByName} paid ${e.splitNames[0]} back` : e.description}
              </Text>
              {!e.isSettlement && (
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {e.paidByName} paid · {e.splitAmong.length === data.members.length ? "split with everyone" : `split with ${e.splitNames.join(", ")}`}
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
