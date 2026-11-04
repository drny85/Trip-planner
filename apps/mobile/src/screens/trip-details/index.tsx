import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import type { TripDetails as TripDetailsData } from "@trip/backend/types";
import { useMutation, useQuery } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { useRef } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { DaySection } from "./day-section";
import { DayTabs } from "./day-tabs";
import { HERO_HEIGHT, TripHero } from "./trip-hero";

export function TripDetails({ tripId }: { tripId: Id<"trips"> }) {
  const trip = useQuery(api.trips.get, { tripId });

  if (trip === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }
  if (trip === null) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        <Stack.Screen options={{ headerTransparent: false, title: "Trip" }} />
        <Text className="text-lg text-muted-foreground">This trip doesn&apos;t exist anymore.</Text>
      </View>
    );
  }
  return <Itinerary trip={trip} />;
}

function Itinerary({ trip }: { trip: TripDetailsData }) {
  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const dayOffsets = useRef<Record<string, number>>({});

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  // A compact title bar fades in once the hero has scrolled away.
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [HERO_HEIGHT - 140, HERO_HEIGHT - 80], [0, 1], Extrapolation.CLAMP),
  }));

  const jumpTo = (subTripId: string) => {
    const y = dayOffsets.current[subTripId];
    if (y != null) scrollRef.current?.scrollTo({ y: y - insets.top - 56, animated: true });
  };

  // Activities are rendered in a ScrollView (a trip has tens of items, not thousands), so
  // cards can animate in once and reflow smoothly when they are reordered.
  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="pb-20"
      >
        <TripHero trip={trip} scrollY={scrollY} />
        <DayTabs subTrips={trip.subTrips} onSelect={jumpTo} />
        {trip.subTrips.map((subTrip, index) => (
          <View
            key={subTrip._id}
            onLayout={(e) => {
              dayOffsets.current[subTrip._id] = e.nativeEvent.layout.y;
            }}
          >
            <DaySection subTrip={subTrip} tripId={trip._id} sectionIndex={index} />
          </View>
        ))}
        <DeleteTrip tripId={trip._id} title={trip.title} />
      </Animated.ScrollView>

      <Animated.View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 items-center justify-end border-b border-border bg-background pb-3"
        style={[{ height: insets.top + 52 }, barStyle]}
      >
        <Text className="text-base font-bold text-foreground" numberOfLines={1}>
          {trip.title}
        </Text>
      </Animated.View>
    </View>
  );
}

function DeleteTrip({ tripId, title }: { tripId: Id<"trips">; title: string }) {
  const remove = useMutation(api.trips.remove);
  const router = useRouter();

  const confirm = () =>
    Alert.alert(`Delete "${title}"?`, "This removes every day and activity in the trip.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          router.back();
          await remove({ tripId });
        },
      },
    ]);

  return (
    <View className="mt-8 px-4">
      <Button variant="danger" icon="trash" onPress={confirm}>
        Delete trip
      </Button>
    </View>
  );
}
