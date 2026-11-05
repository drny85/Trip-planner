import type { Id } from "@trip/backend/dataModel";
import type { TripDetails } from "@trip/backend/types";
import { formatDay } from "@trip/ui";
import { Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { openDayRoute } from "@/lib/open";
import Animated from "react-native-reanimated";
import { enterUp, reflow } from "@/lib/motion";
import { ActivityCard } from "./activity-card";
import { DayWeatherChip } from "./day-weather";

type Props = { subTrip: TripDetails["subTrips"][number]; tripId: Id<"trips">; sectionIndex: number; canEdit: boolean };

export function DaySection({ subTrip, tripId, sectionIndex, canEdit }: Props) {
  const done = subTrip.activities.filter((a) => a.isCompleted).length;
  return (
    <View className="pt-8">
      <View className="flex-row items-end justify-between px-5 pb-4">
        <View className="flex-1 gap-0.5">
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">
            Day {subTrip.dayNumber}
            {subTrip.date ? ` · ${formatDay(subTrip.date)}` : ""}
          </Text>
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">{subTrip.title.replace(/^Day \d+\s*·\s*/, "")}</Text>
        </View>
        <View className="flex-row items-center gap-2 pb-0.5">
          <DayWeatherChip date={subTrip.date} activities={subTrip.activities} />
          <Text className="text-sm text-muted-foreground">
            {done}/{subTrip.activities.length}
          </Text>
          {subTrip.activities.length > 0 && (
            <PressableScale
              onPress={() => void openDayRoute(subTrip.activities)}
              accessibilityRole="link"
              accessibilityLabel={`Route for day ${subTrip.dayNumber}`}
              hitSlop={8}
              className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1.5"
            >
              <Icon name="route" size={14} colorVar="--color-primary" />
              <Text className="text-xs font-semibold text-primary">Route</Text>
            </PressableScale>
          )}
        </View>
      </View>

      {subTrip.activities.length === 0 ? (
        <Text className="mx-5 text-muted-foreground">Nothing planned for this day yet.</Text>
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
