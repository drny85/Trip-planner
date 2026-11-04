import type { TripDetails } from "@trip/backend/types";
import { ScrollView, Text, View } from "react-native";
import { PressableScale } from "@/components/pressable-scale";

/** Horizontal day picker that scrolls the itinerary to a day. */
export function DayTabs({ subTrips, onSelect }: { subTrips: TripDetails["subTrips"]; onSelect: (id: string) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4 pt-6"
    >
      {subTrips.map((s) => {
        const done = s.activities.length > 0 && s.activities.every((a) => a.isCompleted);
        return (
          <PressableScale
            key={s._id}
            onPress={() => onSelect(s._id)}
            className="flex-row items-center gap-2 rounded-full border border-border bg-card px-4 py-2"
          >
            <View className={done ? "h-2 w-2 rounded-full bg-success" : "h-2 w-2 rounded-full bg-primary"} />
            <Text className="text-sm font-semibold text-foreground">Day {s.dayNumber}</Text>
            {s.location ? <Text className="text-sm text-muted-foreground">{s.location}</Text> : null}
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}
