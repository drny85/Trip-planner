import type { SubTrip } from "@trip/backend/types";
import { formatDay } from "@trip/ui";
import { Text, View } from "react-native";

export function DayHeader({ subTrip }: { subTrip: SubTrip }) {
  return (
    <View className="flex-row items-center gap-3 px-4 pb-3 pt-6">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary">
        <Text className="text-base font-bold text-primary-foreground">{subTrip.dayNumber}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-lg font-bold text-foreground">{subTrip.title}</Text>
        <Text className="text-sm text-muted-foreground">
          {[subTrip.date && formatDay(subTrip.date), subTrip.location].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </View>
  );
}
