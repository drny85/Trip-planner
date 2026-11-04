import { api } from "@trip/backend/api";
import type { Trip } from "@trip/backend/types";
import { formatDateRange, tripLength } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { Link, Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { SignOutButton } from "@/components/auth-gate";
import { Button } from "@/components/button";
import { LinearGradient } from "@/components/gradient";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { SmartImage } from "@/components/smart-image";
import { enterUp } from "@/lib/motion";

export function TripsList() {
  const trips = useQuery(api.trips.list);
  const router = useRouter();

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => <SignOutButton />,
          headerRight: () => (
            <Pressable accessibilityLabel="Plan a new trip" onPress={() => router.push("/generate")} hitSlop={12}>
              <Icon name="plus" size={22} colorVar="--color-primary" />
            </Pressable>
          ),
        }}
      />
      {trips === undefined ? (
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator />
        </View>
      ) : (
        // A plain ScrollView: a person has a handful of trips, and it lets cards animate in once.
        <ScrollView
          className="flex-1 bg-background"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="gap-5 p-4 pb-16"
        >
          {trips.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <Animated.View entering={enterUp(0)}>
                <PlanCta />
              </Animated.View>
              {trips.map((trip, index) => (
                <Animated.View key={trip._id} entering={enterUp(index + 1)}>
                  <TripCard trip={trip} />
                </Animated.View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </>
  );
}

function PlanCta() {
  return (
    <Link href="/generate" asChild>
      <PressableScale className="flex-row items-center gap-4 rounded-3xl bg-primary p-5">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
          <Icon name="sparkles" size={22} colorVar="--color-primary-foreground" />
        </View>
        <View className="flex-1">
          <Text className="text-lg font-bold text-primary-foreground">Where to next?</Text>
          <Text className="text-primary-foreground/80">Describe a trip and AI plans every day.</Text>
        </View>
        <Icon name="chevron" size={16} colorVar="--color-primary-foreground" />
      </PressableScale>
    </Link>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const days = tripLength(trip.startDate, trip.endDate);
  return (
    <Link href={{ pathname: "/trips/[tripId]", params: { tripId: trip._id } }} asChild>
      <PressableScale className="h-64 overflow-hidden rounded-[28px] bg-card" pressedScale={0.98}>
        <SmartImage uri={trip.imageUrl} seed={trip._id} className="absolute inset-0" emoji="✈️" />
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.05)", "rgba(0,0,0,0.75)"]}
          className="absolute inset-0"
        />
        <View className="absolute left-4 right-4 top-4 flex-row gap-2">
          <Chip>{`${days} ${days === 1 ? "day" : "days"}`}</Chip>
          {trip.isAIGenerated && <Chip>✨ AI</Chip>}
        </View>
        <View className="absolute inset-x-0 bottom-0 gap-1 p-5">
          <Text className="text-3xl font-extrabold tracking-tight text-white" numberOfLines={1}>
            {trip.title}
          </Text>
          <Text className="text-white/85">
            {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
          </Text>
        </View>
      </PressableScale>
    </Link>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <View className="rounded-full bg-black/35 px-3 py-1">
      <Text className="text-xs font-semibold text-white">{children}</Text>
    </View>
  );
}

function EmptyState() {
  const router = useRouter();
  const seed = useMutation(api.seed.demoTrip);
  const [loading, setLoading] = useState(false);

  const loadDemo = async () => {
    setLoading(true);
    try {
      const tripId = await seed();
      router.push({ pathname: "/trips/[tripId]", params: { tripId } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View entering={enterUp(0)} className="items-center gap-4 rounded-[28px] bg-card p-8">
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
        <Icon name="sparkles" size={36} colorVar="--color-primary" />
      </View>
      <Text className="text-center text-2xl font-extrabold text-foreground">Plan your first trip</Text>
      <Text className="text-center text-muted-foreground">
        Describe a trip and AI builds the whole itinerary, or load the sample Tokyo trip to look around.
      </Text>
      <Button icon="sparkles" className="self-stretch" onPress={() => router.push("/generate")}>
        Plan with AI
      </Button>
      <Button variant="secondary" className="self-stretch" loading={loading} onPress={loadDemo}>
        Load demo trip
      </Button>
    </Animated.View>
  );
}
