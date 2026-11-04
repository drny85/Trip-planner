import { api } from "@trip/backend/api";
import type { Trip } from "@trip/backend/types";
import { formatDateRange } from "@trip/ui";
import { Link, Stack, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { SignOutButton } from "@/components/auth-gate";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { Image } from "@/components/image";

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
        <FlatList
          className="flex-1 bg-background"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="gap-4 p-4 pb-12"
          data={trips}
          keyExtractor={(trip) => trip._id}
          renderItem={({ item }) => <TripCard trip={item} />}
          ListEmptyComponent={<EmptyState />}
        />
      )}
    </>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link href={{ pathname: "/trips/[tripId]", params: { tripId: trip._id } }} asChild>
      <Pressable className="overflow-hidden rounded-3xl bg-card active:opacity-80">
        <Image source={trip.imageUrl} className="h-44 w-full" contentFit="cover" transition={200} />
        <View className="gap-1 p-4">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-xl font-bold text-foreground" numberOfLines={1}>
              {trip.title}
            </Text>
            {trip.isAIGenerated && (
              <View className="flex-row items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5">
                <Icon name="sparkles" size={12} colorVar="--color-primary" />
                <Text className="text-xs font-semibold text-primary">AI</Text>
              </View>
            )}
          </View>
          <Text className="text-muted-foreground">
            {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
          </Text>
        </View>
      </Pressable>
    </Link>
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
    <View className="items-center gap-4 rounded-3xl bg-card p-8">
      <Icon name="sparkles" size={36} colorVar="--color-primary" />
      <Text className="text-center text-2xl font-bold text-foreground">No trips yet</Text>
      <Text className="text-center text-muted-foreground">
        Describe a trip and AI will build the whole itinerary, or load the sample Tokyo trip to look around.
      </Text>
      <Button icon="sparkles" className="self-stretch" onPress={() => router.push("/generate")}>
        Plan with AI
      </Button>
      <Button variant="secondary" className="self-stretch" loading={loading} onPress={loadDemo}>
        Load demo trip
      </Button>
    </View>
  );
}
