import type { Id } from "@trip/backend/dataModel";
import type { TripDetails } from "@trip/backend/types";
import { formatDay } from "@trip/ui";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { enterUp, reflow } from "@/lib/motion";
import { ActivityCard } from "./activity-card";

type Props = { subTrip: TripDetails["subTrips"][number]; tripId: Id<"trips">; sectionIndex: number };

export function DaySection({ subTrip, tripId, sectionIndex }: Props) {
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
        <Text className="pb-1 text-sm text-muted-foreground">
          {done}/{subTrip.activities.length}
        </Text>
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
            <ActivityCard activity={activity} tripId={tripId} isLast={index === subTrip.activities.length - 1} />
          </Animated.View>
        ))
      )}
    </View>
  );
}
