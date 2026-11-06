import { api } from "@trip/backend/api";
import { budgetOverview, currenciesIn, type BudgetScope, type Line } from "@trip/backend/budgetOverview";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useRates } from "@/lib/use-rates";
import { CSS_EASE_OUT, enterUp } from "@/lib/motion";

const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, (part / whole) * 100) : part > 0 ? 100 : 0);
const bar = { transitionProperty: "width", transitionDuration: 400, transitionTimingFunction: CSS_EASE_OUT } as const;
const PRIMARY = "#0e7c66";

/**
 * The full trip budget: planned next to spent, by category and by day, from the
 * itinerary, priced bookings, shared costs and flights not booked yet. Same math
 * as the web page (lib/budgetOverview.ts in the backend package).
 */
export function BudgetOverviewScreen({ tripId }: { tripId: Id<"trips"> }) {
  const trip = useQuery(api.trips.get, { tripId });
  const extras = useQuery(api.budget.overview, { tripId });
  const { t, f, category } = useI18n();
  const [scope, setScope] = useState<BudgetScope>("me");
  const [picked, setPicked] = useState<string | null>(null);
  const local = extras?.tripCurrency ?? trip?.currency ?? "USD";
  const display = picked ?? local;
  const codes = useMemo(() => (trip && extras ? currenciesIn(trip, extras, display) : []), [trip, extras, display]);
  const { rates, loading } = useRates(codes, display);

  if (trip === undefined || extras === undefined) return <ActivityIndicator className="mt-10" />;
  if (trip === null || extras === null) return <Text className="p-8 text-center text-muted-foreground">{t("budgetOverview.notFound")}</Text>;

  const view = budgetOverview({ trip, extras, scope, display, rates });
  const money = (n: number) => f.money(Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100, display);
  const { planned, spent } = view.total;
  const over = spent > planned;
  const empty = planned === 0 && spent === 0;
  const choices = [
    { code: local, tag: t("budgetOverview.localTag") },
    { code: extras.homeCurrency, tag: t("budgetOverview.homeTag") },
    { code: extras.groupCurrency, tag: t("budgetOverview.groupTag") },
  ].filter((c, i, all): c is { code: string; tag: string } => !!c.code && all.findIndex((x) => x.code === c.code) === i);
  const hasDoneEstimates = extras.expenses.length === 0 && trip.subTrips.some((d) => d.activities.some((a) => a.isCompleted && a.estimatedCost != null && a.actualCost == null));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-4 pb-16">
      <View className="gap-1 px-1">
        <Text className="text-base font-semibold text-muted-foreground">{trip.title}</Text>
        <Text className="text-sm text-muted-foreground">{t("budgetOverview.intro")}</Text>
      </View>

      <View className="gap-2 px-1">
        {extras.travelers > 1 && (
          <Segmented
            label={t("budgetOverview.scope")}
            value={scope}
            onChange={setScope}
            options={[
              { value: "me", label: t("budgetOverview.scopeMe") },
              { value: "group", label: t("budgetOverview.scopeGroup") },
            ]}
          />
        )}
        {choices.length > 1 && <Segmented label={t("budgetOverview.showIn")} value={display} onChange={setPicked} options={choices.map((c) => ({ value: c.code, label: `${c.code} · ${c.tag}` }))} />}
      </View>

      <Animated.View entering={enterUp(0)} className="gap-3 rounded-3xl bg-card p-5 shadow-sm shadow-black/5">
        <View className="flex-row gap-4">
          <View className="flex-1">
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("budgetOverview.planned")}</Text>
            <Text className="text-3xl font-extrabold text-foreground" adjustsFontSizeToFit numberOfLines={1}>{money(planned)}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("budgetOverview.spent")}</Text>
            <Text className={cn("text-3xl font-extrabold", over ? "text-danger" : "text-foreground")} adjustsFontSizeToFit numberOfLines={1}>{money(spent)}</Text>
          </View>
        </View>
        <View className="h-2.5 overflow-hidden rounded-full bg-muted">
          <Animated.View className={cn("absolute bottom-0 left-0 top-0 rounded-full", over ? "bg-danger" : "bg-primary")} style={[{ width: `${pct(spent, planned)}%` }, bar]} />
        </View>
        {!empty && (
          <Text className={cn("text-sm", over ? "font-semibold text-danger" : "text-muted-foreground")}>
            {over ? t("budgetOverview.over", { amount: money(spent - planned) }) : t("budgetOverview.left", { amount: money(planned - spent) })}
            {planned > 0 ? ` · ${t("budgetOverview.percentSpent", { percent: Math.round((spent / planned) * 100) })}` : ""}
          </Text>
        )}
        {empty && !loading && <Text className="text-sm text-muted-foreground">{t("budgetOverview.empty")}</Text>}
        {loading && <Text className="text-sm text-muted-foreground">{t("budgetOverview.loadingRates")}</Text>}
        {!loading && view.missingRates.length > 0 && <Text className="text-sm text-danger">{t("budgetOverview.noRate", { codes: view.missingRates.join(", ") })}</Text>}
      </Animated.View>

      {!empty && (
        <>
          <Bars
            index={1}
            title={t("budgetOverview.byCategory")}
            money={money}
            rows={view.byCategory.map((c) => {
              const meta = category(c.category);
              return { key: c.category, label: `${meta.emoji} ${meta.text}`, color: meta.color, line: c };
            })}
          />
          <Bars
            index={2}
            title={t("budgetOverview.byDay")}
            money={money}
            rows={view.byDay.map((d) => ({
              key: d.key,
              label: d.key === "before" ? t("budgetOverview.before") : d.key === "after" ? t("budgetOverview.after") : d.title || t("budgetOverview.dayN", { day: d.dayNumber ?? "" }),
              sub: d.date ? f.day(d.date) : undefined,
              color: PRIMARY,
              line: d,
            }))}
          />
        </>
      )}

      {view.bySource.length > 0 && (
        <Animated.View entering={enterUp(3)} className="gap-3 rounded-3xl bg-card p-5 shadow-sm shadow-black/5">
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("budgetOverview.bySource")}</Text>
          {view.bySource.map((s) => (
            <View key={s.source} className="gap-0.5 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="flex-1 font-semibold text-foreground">{t(`budgetOverview.sources.${s.source}`)}</Text>
                <Text className="text-sm text-muted-foreground">{t("budgetOverview.plannedSpent", { spent: money(s.spent), planned: money(s.planned) })}</Text>
              </View>
              <Text className="text-xs text-muted-foreground">{t(`budgetOverview.sourceHints.${s.source}`)}</Text>
            </View>
          ))}
          {hasDoneEstimates && <Text className="text-xs text-muted-foreground">{t("budgetOverview.doneCounts")}</Text>}
        </Animated.View>
      )}
    </ScrollView>
  );
}

function Segmented<V extends string>({ label, value, onChange, options }: { label: string; value: V; onChange: (v: V) => void; options: { value: V; label: string }[] }) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text className="text-sm font-semibold text-muted-foreground">{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row rounded-full bg-muted p-1">
        {options.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === o.value }}
            onPress={() => onChange(o.value)}
            hitSlop={4}
            className={cn("rounded-full px-3 py-1.5", value === o.value && "bg-card")}
          >
            <Text className={cn("text-xs font-semibold", value === o.value ? "text-foreground" : "text-muted-foreground")}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Planned as a light track, spent as the solid bar on top; red when a row goes over. */
function Bars({ index, title, rows, money }: { index: number; title: string; money: (n: number) => string; rows: { key: string; label: string; sub?: string; color: string; line: Line }[] }) {
  const { t } = useI18n();
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.line.planned, r.line.spent)));
  return (
    <Animated.View entering={enterUp(index)} className="gap-3 rounded-3xl bg-card p-5 shadow-sm shadow-black/5">
      <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</Text>
      {rows.map((r) => {
        const over = r.line.spent > r.line.planned;
        return (
          <View key={r.key} className="gap-1.5">
            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
                {r.label}
                {r.sub ? <Text className="text-xs font-normal text-muted-foreground">{`  ${r.sub}`}</Text> : null}
              </Text>
              <Text className={cn("text-sm", over ? "font-semibold text-danger" : "text-muted-foreground")}>{t("budgetOverview.plannedSpent", { spent: money(r.line.spent), planned: money(r.line.planned) })}</Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-muted">
              <View className="absolute bottom-0 left-0 top-0 rounded-full opacity-25" style={{ width: `${pct(r.line.planned, scale)}%`, backgroundColor: r.color }} />
              <Animated.View
                className={cn("absolute bottom-0 left-0 top-0 rounded-full", over && "bg-danger")}
                style={[{ width: `${pct(r.line.spent, scale)}%` }, over ? null : { backgroundColor: r.color }, bar]}
              />
            </View>
          </View>
        );
      })}
    </Animated.View>
  );
}
