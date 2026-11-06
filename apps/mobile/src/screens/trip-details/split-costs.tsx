import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { errorCode } from "@trip/backend/splitDraft";
import { useI18n } from "@trip/i18n/react";
import { cn, currencyChoices } from "@trip/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Button } from "@/components/button";
import { EASE_IN_OUT, EASE_OUT } from "@/lib/motion";

export type SplitData = NonNullable<FunctionReturnType<typeof api.expenses.forTrip>>;
type T = ReturnType<typeof useI18n>["t"];
const PAGE = 8;

/** Names and money for the split screens, from one place. */
export function useSplitText(data: SplitData | null | undefined) {
  const { t, f } = useI18n();
  const byId = new Map((data?.people ?? []).map((p) => [p.userId, p]));
  /** Group-currency cents, or cents of another currency when one is given. */
  const money = (cents: number, currency = data?.currency ?? "USD") => f.money(cents / 100, currency);
  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p?.isMe ? t("split.you") : (p?.name ?? t("split.formerMember"));
  };
  const firstName = (id: string) => (byId.get(id)?.isMe ? t("split.you") : nameOf(id).split(" ")[0]!);
  return { t, money, nameOf, firstName };
}

/** Translates a failed expense mutation into a message for the user. */
export function splitErrorMessage(t: T, e: unknown) {
  const code = errorCode(e);
  const key = `split.errors.${code}` as Parameters<T>[0];
  const text = code ? t(key) : null;
  return text && text !== key ? text : t("split.couldntAdd");
}

/** The group's shared costs: your balance, where everyone stands, who pays whom, and the history. */
export function SplitCostsSection({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.expenses.forTrip, { tripId });
  const undo = useMutation(api.expenses.removePayment);
  const changeCurrency = useMutation(api.expenses.setGroupCurrency);
  const fetchRate = useAction(api.fx.rate);
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const { t, money, nameOf, firstName } = useSplitText(data);
  if (!data) return null;
  const mine = data.myBalanceCents;
  const people = data.people.filter((p) => p.isMember || p.netCents !== 0);
  const entries = showAll ? data.entries : data.entries.slice(0, PAGE);
  const members = data.people.filter((p) => p.isMember);

  /** The organizer picks a new group currency; today's rate converts everything after a confirm. */
  const pickGroupCurrency = () => {
    const options = currencyChoices(data.homeCurrency, data.localCurrency, data.currency).filter((c) => c !== data.currency);
    if (options.length === 0) return;
    Alert.alert(t("split.balancesIn", { currency: data.currency }), undefined, [
      ...options.map((next) => ({
        text: next,
        onPress: async () => {
          const r = await fetchRate({ from: data.currency, to: next }).catch(() => null);
          if (!r) return Alert.alert(t("split.rateMissing"));
          Alert.alert(t("split.switchCurrency", { currency: next }), t("split.switchCurrencyHint", { from: data.currency, rate: String(Number(r.rate.toPrecision(6))), to: next }), [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("split.confirm"), onPress: () => void changeCurrency({ tripId, currency: next, rate: r.rate }).catch((err: unknown) => Alert.alert(splitErrorMessage(t, err))) },
          ]);
        },
      })),
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  };

  return (
    <View className="mt-10 gap-3 px-4">
      <View className="flex-row items-end justify-between">
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">{t("split.eyebrow")}</Text>
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">{t("split.title")}</Text>
          <Text className="text-xs text-muted-foreground">
            {data.totalCents > 0 ? t("mobileMoney.sharedSoFar", { amount: money(data.totalCents) }) : t("mobileMoney.logHint")}
          </Text>
          <Pressable disabled={!data.canChangeCurrency} onPress={pickGroupCurrency} hitSlop={6} accessibilityRole={data.canChangeCurrency ? "button" : undefined}>
            <Text className="text-xs text-muted-foreground">
              {t("split.balancesIn", { currency: data.currency })}
              {data.canChangeCurrency && <Text className="font-semibold text-primary"> · {t("split.changeCurrency")}</Text>}
            </Text>
          </Pressable>
        </View>
        <Button size="sm" icon="plus" onPress={() => router.push({ pathname: "/trips/[tripId]/expense", params: { tripId } })}>
          {t("mobileMoney.expense")}
        </Button>
      </View>

      <View className={cn("gap-3 rounded-3xl p-4", mine > 0 ? "bg-success/10" : mine < 0 ? "bg-danger/10" : "bg-card")}>
        <View>
          <Text className="text-xs text-muted-foreground">{t("split.yourBalance")}</Text>
          <Text className={cn("text-xl font-bold", mine > 0 ? "text-success" : mine < 0 ? "text-danger" : "text-foreground")}>
            {mine === 0 ? t("split.allSquare") : mine > 0 ? t("split.youreOwed", { amount: money(mine) }) : t("split.youOwe", { amount: money(-mine) })}
          </Text>
        </View>

        {data.totalCents > 0 && (
          <View className="gap-1.5">
            <Text className="text-xs font-semibold text-muted-foreground">{t("split.whoPaid")}</Text>
            {people.map((p) => (
              <View key={p.userId} className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>{nameOf(p.userId)}</Text>
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>{t("split.paidAndShare", { paid: money(p.paidCents), share: money(p.shareCents) })}</Text>
                </View>
                <Text className={cn("text-sm font-bold", p.netCents > 0 ? "text-success" : p.netCents < 0 ? "text-danger" : "text-muted-foreground")}>
                  {p.netCents === 0 ? t("split.settled") : p.netCents > 0 ? t("split.getsBack", { amount: money(p.netCents) }) : t("split.owes", { amount: money(-p.netCents) })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {data.transfers.length > 0 && (
          <View className="gap-1">
            <Text className="text-xs font-semibold text-muted-foreground">{t("split.suggested")}</Text>
            {data.transfers.map((tr) => (
              <Animated.View key={`${tr.from}-${tr.to}`} entering={FadeIn.duration(200).easing(EASE_OUT)} exiting={FadeOut.duration(150)} className="mt-1 flex-row items-center gap-2">
                <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                  <Text className="font-semibold">{nameOf(tr.from)}</Text> → <Text className="font-semibold">{nameOf(tr.to)}</Text>
                </Text>
                <Text className="text-sm font-bold text-foreground">{money(tr.amountCents)}</Text>
                {tr.canRecord && (
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: "/trips/[tripId]/payment", params: { tripId, from: tr.from, to: tr.to } })}
                    className="rounded-full bg-primary/15 px-2.5 py-1"
                  >
                    <Text className="text-xs font-semibold text-primary">{t("mobileMoney.paid")}</Text>
                  </Pressable>
                )}
              </Animated.View>
            ))}
          </View>
        )}
      </View>

      {entries.map((e) => (
        <Animated.View key={e._id} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={LinearTransition.duration(240).easing(EASE_IN_OUT)}>
          {e.kind === "expense" ? (
            <Pressable
              disabled={!e.canEdit}
              onPress={() => router.push({ pathname: "/trips/[tripId]/expense", params: { tripId, expenseId: e._id } })}
              accessibilityHint={e.canEdit ? t("split.editExpense") : undefined}
              className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3"
            >
              <View className="flex-1">
                <Text className="font-semibold text-foreground" numberOfLines={1}>{e.description}</Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {e.mode !== "equal"
                    ? t("split.paidSplitBy", { name: nameOf(e.paidBy), how: t(`split.splitSummary.${e.mode}`) })
                    : e.shares.length === members.length && members.every((m) => e.shares.some((s) => s.userId === m.userId))
                      ? t("split.paidSplitEveryone", { name: nameOf(e.paidBy) })
                      : t("split.paidSplitWith", { name: nameOf(e.paidBy), names: e.shares.map((s) => firstName(s.userId)).join(", ") })}
                </Text>
              </View>
              <View className="items-end">
                <Text className="font-bold text-foreground">{money(e.amountCents, e.currency)}</Text>
                {e.currency !== data.currency && <Text className="text-xs text-muted-foreground">{t("split.converted", { amount: money(e.groupCents) })}</Text>}
                {e.myShareCents > 0 && <Text className="text-xs text-muted-foreground">{t("split.yourShare", { amount: money(e.myShareCents) })}</Text>}
              </View>
            </Pressable>
          ) : (
            <Pressable
              onLongPress={() =>
                e.canEdit &&
                Alert.alert(t("split.undoPayment"), t("split.paidBack", { from: nameOf(e.from), to: nameOf(e.to) }), [
                  { text: t("common.cancel"), style: "cancel" },
                  {
                    text: t("split.undoPayment"),
                    style: "destructive",
                    onPress: () => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      undo({ paymentId: e._id }).catch((err: unknown) => Alert.alert(splitErrorMessage(t, err)));
                    },
                  },
                ])
              }
              className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3"
            >
              <Text className="flex-1 font-semibold text-foreground" numberOfLines={1}>
                🤝 {t("split.paidBack", { from: nameOf(e.from), to: nameOf(e.to) })}
              </Text>
              <Text className="font-bold text-muted-foreground">{money(e.amountCents)}</Text>
            </Pressable>
          )}
        </Animated.View>
      ))}
      {data.entries.length > PAGE && (
        <Pressable onPress={() => setShowAll((s) => !s)} accessibilityRole="button" className="items-center py-2">
          <Text className="text-sm font-semibold text-primary">{showAll ? t("split.showLess") : t("split.showAll", { count: data.entries.length })}</Text>
        </Pressable>
      )}
    </View>
  );
}
