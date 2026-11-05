import { budgetSummary } from "@trip/backend/budget";
import type { TripDetails } from "@trip/backend/types";
import { cn, formatMoney, getCategory } from "@trip/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { CSS_EASE_OUT, enterUp } from "@/lib/motion";

/** Estimated cost per person by category or by day, with what's been spent so far. */
export function BudgetCard({ trip }: { trip: TripDetails }) {
  const budget = useMemo(() => budgetSummary(trip), [trip]);
  const [view, setView] = useState<"category" | "day">("category");
  const money = (n: number) => formatMoney(n, trip.currency ?? "USD");
  const { estimated, actual } = budget.total;
  if (estimated === 0 && actual === 0) return null;

  const over = actual > estimated;
  const spentPct = estimated ? Math.min(100, Math.round((actual / estimated) * 100)) : 0;
  const rows =
    view === "category"
      ? budget.byCategory.map((c) => {
          const meta = getCategory(c.category);
          return { key: c.category, label: `${meta.emoji} ${meta.label}`, color: meta.color, ...c.money };
        })
      : budget.byDay.map((d) => ({ key: d.subTripId, label: `Day ${d.dayNumber}`, color: "#0e7c66", ...d.money }));
  const max = Math.max(1, ...rows.map((r) => Math.max(r.estimated, r.actual)));
  const bar = { transitionProperty: "width", transitionDuration: 400, transitionTimingFunction: CSS_EASE_OUT } as const;

  return (
    <Animated.View entering={enterUp(1)} className="mx-4 mt-4 gap-4 rounded-3xl bg-card p-5 shadow-sm shadow-black/5">
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Budget per person</Text>
          <Text className="text-3xl font-extrabold text-foreground">{money(estimated)}</Text>
          <Text className={cn("text-sm", over ? "font-semibold text-danger" : "text-muted-foreground")}>
            {money(actual)} spent · {over ? `${money(actual - estimated)} over` : `${money(estimated - actual)} left`}
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
                {v === "category" ? "Category" : "Day"}
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
              <Text className="text-sm text-muted-foreground">
                {r.actual > 0 ? `${money(r.actual)} / ` : ""}
                {money(r.estimated)}
              </Text>
            </View>
            <View className="h-1.5 overflow-hidden rounded-full bg-muted">
              <Animated.View className="absolute bottom-0 left-0 top-0 rounded-full opacity-30" style={[{ width: `${(r.estimated / max) * 100}%`, backgroundColor: r.color }, bar]} />
              <Animated.View className="absolute bottom-0 left-0 top-0 rounded-full" style={[{ width: `${(r.actual / max) * 100}%`, backgroundColor: r.color }, bar]} />
            </View>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}
