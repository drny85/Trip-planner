import type { Id } from "@trip/backend/dataModel";
import type { TripDetails } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { cn, dayTitle } from "@trip/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { openDayRoute } from "@/lib/open";
import Animated from "react-native-reanimated";
import { enterUp, reflow } from "@/lib/motion";
import { ActivityCard } from "./activity-card";
import { useRouter } from "expo-router";
import { DayMap, mappableStops, nativeMapsAvailable } from "./day-map";
import { DayWeatherChip, useDayWeather } from "./day-weather";

type Props = { subTrip: TripDetails["subTrips"][number]; tripId: Id<"trips">; sectionIndex: number; canEdit: boolean };

export function DaySection({ subTrip, tripId, sectionIndex, canEdit }: Props) {
  const done = subTrip.activities.filter((a) => a.isCompleted).length;
  const weather = useDayWeather(subTrip.date, subTrip.activities);
  const router = useRouter();
  const rainy = (weather?.rainChance ?? 0) >= 50;
  const { t, f } = useI18n();
  const [mapOpen, setMapOpen] = useState(false);
  const canMap = nativeMapsAvailable && mappableStops(subTrip.activities).length > 0;
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
          {canMap && (
            <PressableScale
              onPress={() => setMapOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: mapOpen }}
              accessibilityLabel={t("map.dayLabel", { day: subTrip.dayNumber })}
              hitSlop={8}
              className={cn("flex-row items-center gap-1 rounded-full px-3 py-1.5", mapOpen ? "bg-primary" : "bg-muted")}
            >
              <Icon name="map" size={14} colorVar={mapOpen ? "--color-primary-foreground" : "--color-primary"} />
              <Text className={cn("text-xs font-semibold", mapOpen ? "text-primary-foreground" : "text-primary")}>{t("map.short")}</Text>
            </PressableScale>
          )}
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

      {canMap && mapOpen && <DayMap activities={subTrip.activities} />}

      {canEdit && subTrip.activities.length > 0 && (
        <PressableScale
          onPress={() => router.push({ pathname: "/trips/[tripId]/replan/[subTripId]", params: { tripId, subTripId: subTrip._id } })}
          accessibilityRole="button"
          className={cn("mx-5 mb-4 flex-row items-center justify-center gap-2 rounded-2xl py-2.5", rainy ? "bg-sky-500" : "bg-muted")}
        >
          <Text className={cn("text-sm font-semibold", rainy ? "text-white" : "text-foreground")}>
            {rainy ? `☔ ${t("mobileDay.rainPlan", { percent: weather!.rainChance })}` : `✨ ${t("mobileDay.replan")}`}
          </Text>
        </PressableScale>
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
