import type { Id } from "@trip/backend/dataModel";
import type { TripDetails } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { cn, dayTitle } from "@trip/ui";
import { Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { openDayRoute } from "@/lib/open";
import Animated from "react-native-reanimated";
import { enterUp, reflow } from "@/lib/motion";
import { ActivityCard } from "./activity-card";
import { useRouter } from "expo-router";
import { DayWeatherChip, useDayWeather } from "./day-weather";

type Props = { subTrip: TripDetails["subTrips"][number]; tripId: Id<"trips">; sectionIndex: number; canEdit: boolean };

export function DaySection({ subTrip, tripId, sectionIndex, canEdit }: Props) {
  const done = subTrip.activities.filter((a) => a.isCompleted).length;
  const weather = useDayWeather(subTrip.date, subTrip.activities);
  const router = useRouter();
  const rainy = (weather?.rainChance ?? 0) >= 50;
  const localOn = Boolean(subTrip.localPickAt);
  const { t, f } = useI18n();
  return (
    <View className="pt-8">
      <View className="gap-2 px-5 pb-4">
        <View className="gap-0.5">
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">
            {t("time.dayN", { day: subTrip.dayNumber })}
            {subTrip.date ? ` · ${f.weekday(subTrip.date)}` : ""}
          </Text>
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">{dayTitle(subTrip.title)}</Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <DayWeatherChip weather={weather} />
          {subTrip.activities.length > 0 && (
            <Text className="text-sm text-muted-foreground">
              {t("mobileDay.doneOf", { done, total: subTrip.activities.length })}
            </Text>
          )}
          <View className="flex-1" />
          {subTrip.activities.length > 0 && (
            <PressableScale
              onPress={() => void openDayRoute(subTrip.activities)}
              accessibilityRole="link"
              accessibilityLabel={t("mobileDay.routeLabel", { day: subTrip.dayNumber })}
              hitSlop={8}
              className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1.5"
            >
              <Icon name="route" size={14} colorVar="--color-primary" />
              <Text className="text-xs font-semibold text-primary">{t("mobileDay.route")}</Text>
            </PressableScale>
          )}
        </View>
      </View>

      {canEdit && subTrip.activities.length > 0 && (
        <View className="mx-5 mb-4 flex-row gap-2">
          <PressableScale
            onPress={() => router.push({ pathname: "/trips/[tripId]/replan/[subTripId]", params: { tripId, subTripId: subTrip._id } })}
            accessibilityRole="button"
            className={cn("flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-2.5", rainy ? "bg-sky-500" : "bg-muted")}
          >
            <Text className={cn("text-sm font-semibold", rainy ? "text-white" : "text-foreground")} numberOfLines={1}>
              {rainy ? `☔ ${t("mobileDay.rainPlan", { percent: weather!.rainChance })}` : `✨ ${t("mobileDay.replan")}`}
            </Text>
          </PressableScale>
          <PressableScale
            onPress={() => router.push({ pathname: "/trips/[tripId]/local/[subTripId]", params: { tripId, subTripId: subTrip._id } })}
            accessibilityRole="button"
            accessibilityHint={t("local.buttonTitle")}
            accessibilityState={{ selected: localOn }}
            className={cn("flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-2.5", localOn ? "bg-violet-600" : "bg-muted")}
          >
            <Text className={cn("text-sm font-semibold", localOn ? "text-white" : "text-foreground")} numberOfLines={1}>
              {`💎 ${localOn ? t("local.gem") : t("local.button")}`}
            </Text>
          </PressableScale>
        </View>
      )}
      {!canEdit && localOn && (
        <View className="mx-5 mb-4 self-start rounded-full bg-violet-600/10 px-3 py-1.5">
          <Text className="text-xs font-semibold text-violet-700 dark:text-violet-300">{`💎 ${t("local.on")}`}</Text>
        </View>
      )}

      {subTrip.activities.length === 0 ? (
        <Text className="mx-5 text-muted-foreground">{t("trip.nothingPlanned")}</Text>
      ) : (
        subTrip.activities.map((activity, index) => (
          <Animated.View
            key={activity._id}
            entering={sectionIndex === 0 ? enterUp(index + 1) : undefined}
            layout={reflow}
          >
            <ActivityCard activity={activity} tripId={tripId} canEdit={canEdit} isLast={index === subTrip.activities.length - 1} />
          </Animated.View>
        ))
      )}
    </View>
  );
}
