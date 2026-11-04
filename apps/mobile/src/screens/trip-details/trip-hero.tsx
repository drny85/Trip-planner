import type { TripDetails } from "@trip/backend/types";
import { formatDateRange } from "@trip/ui";
import { Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { Image } from "@/components/image";

export function TripHero({ trip }: { trip: TripDetails }) {
  const { completed, total } = trip.progress;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <View className="mb-2">
      <View className="h-80 w-full">
        <Image source={trip.imageUrl} className="absolute inset-0" contentFit="cover" transition={250} />
        <View className="absolute inset-0 bg-black/35" />
        <View className="absolute inset-x-0 bottom-0 gap-1 p-5">
          {trip.isAIGenerated && (
            <View className="flex-row items-center gap-1 self-start rounded-full bg-white/20 px-2.5 py-1">
              <Icon name="sparkles" size={12} colorVar="--color-accent" />
              <Text className="text-xs font-semibold text-white">AI generated</Text>
            </View>
          )}
          <Text className="text-4xl font-extrabold text-white">{trip.title}</Text>
          <View className="flex-row items-center gap-2">
            <Text className="text-base text-white/90">{trip.destination}</Text>
            <Text className="text-white/60">·</Text>
            <Text className="text-base text-white/90">{formatDateRange(trip.startDate, trip.endDate)}</Text>
          </View>
        </View>
      </View>

      <View className="mx-4 -mt-5 gap-2 rounded-2xl bg-card p-4 shadow-sm">
        <View className="flex-row items-baseline justify-between">
          <Text className="font-semibold text-foreground">Trip progress</Text>
          <Text className="text-sm text-muted-foreground">
            {completed} of {total} done
          </Text>
        </View>
        <View className="h-2 overflow-hidden rounded-full bg-muted">
          <View className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </View>
        {trip.description ? <Text className="pt-1 text-muted-foreground">{trip.description}</Text> : null}
      </View>
    </View>
  );
}
