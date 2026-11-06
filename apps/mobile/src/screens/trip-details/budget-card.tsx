import { budgetSummary } from "@trip/backend/budget";
import type { TripDetails } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { CSS_EASE_OUT, enterUp } from "@/lib/motion";

/** Estimated cost per person by category or by day, with what's been spent so far. */
export function BudgetCard({ trip }: { trip: TripDetails }) {
  const budget = useMemo(() => budgetSummary(trip), [trip]);
  const [view, setView] = useState<"category" | "day">("category");
  const { t, f, category } = useI18n();
  const money = (n: number) => f.money(n, trip.currency ?? "USD");
  const router = useRouter();
  const { estimated, actual } = budget.total;
  const overviewLink = (
    <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push({ pathname: "/trips/[tripId]/budget", params: { tripId: trip._id } })} className="self-end">
      <Text className="text-sm font-semibold text-primary">{t("budgetOverview.seeOverview")} →</Text>
    </Pressable>
  );
  // No estimates yet, but bookings or shared costs may still add up on the overview.
  if (estimated === 0 && actual === 0)
    return (
      <Animated.View entering={enterUp(1)} className="mx-4 mt-4 flex-row items-center justify-between rounded-3xl bg-card px-5 py-4 shadow-sm shadow-black/5">
        <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("budgetOverview.title")}</Text>
        {overviewLink}
      </Animated.View>
    );

  const over = actual > estimated;
  const spentPct = estimated ? Math.min(100, Math.round((actual / estimated) * 100)) : 0;
  const rows =
    view === "category"
      ? budget.byCategory.map((c) => {
          const meta = category(c.category);
          return { key: c.category, label: `${meta.emoji} ${meta.text}`, color: meta.color, ...c.money };
        })
      : budget.byDay.map((d) => ({ key: d.subTripId, label: t("time.dayN", { day: d.dayNumber }), color: "#0e7c66", ...d.money }));
  const bar = { transitionProperty: "width", transitionDuration: 400, transitionTimingFunction: CSS_EASE_OUT } as const;

  return (
    <Animated.View entering={enterUp(1)} className="mx-4 mt-4 gap-4 rounded-3xl bg-card p-5 shadow-sm shadow-black/5">
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("budget.title")}</Text>
          <Text className="text-3xl font-extrabold text-foreground">{money(estimated)}</Text>
          <Text className={cn("text-sm", over ? "font-semibold text-danger" : "text-muted-foreground")}>
            {t("budget.spent", { amount: money(actual) })} · {over ? t("budget.over", { amount: money(actual - estimated) }) : t("budget.left", { amount: money(estimated - actual) })}
          </Text>
        </View>
        <View className="flex-row rounded-full bg-muted p-1">
          {(["category", "day"] as const).map((v) => (
            <Pressable
              key={v}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === v }}
              onPress={() => setView(v)}
              hitSlop={6}
              className={cn("rounded-full px-3 py-1.5", view === v && "bg-card")}
            >
              <Text className={cn("text-xs font-semibold", view === v ? "text-foreground" : "text-muted-foreground")}>
                {v === "category" ? t("mobileMoney.category") : t("mobileMoney.day")}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="h-2 overflow-hidden rounded-full bg-muted">
        <Animated.View className={cn("absolute bottom-0 left-0 top-0 rounded-full", over ? "bg-danger" : "bg-primary")} style={[{ width: `${spentPct}%` }, bar]} />
      </View>

      <View className="gap-3">
        {rows.map((r) => (
          <View key={r.key} className="gap-1.5">
            <View className="flex-row justify-between">
              <Text className="text-sm font-semibold text-foreground">{r.label}</Text>
              <Text className={cn("text-sm", r.actual > r.estimated ? "font-semibold text-danger" : "text-muted-foreground")}>
                {r.actual > 0 ? `${money(r.actual)} ${t("budget.of", { amount: money(r.estimated) })}` : t("budget.planned", { amount: money(r.estimated) })}
              </Text>
            </View>
            {/* How much of this row's plan is spent: full when it's all spent, red when over. */}
            <View className="h-1.5 overflow-hidden rounded-full bg-muted">
              <Animated.View
                className={cn("absolute bottom-0 left-0 top-0 rounded-full", r.actual > r.estimated && "bg-danger")}
                style={[
                  { width: `${r.estimated ? Math.min(100, (r.actual / r.estimated) * 100) : r.actual > 0 ? 100 : 0}%` },
                  r.actual > r.estimated ? null : { backgroundColor: r.color },
                  bar,
                ]}
              />
            </View>
          </View>
        ))}
      </View>
      {overviewLink}
    </Animated.View>
  );
}
