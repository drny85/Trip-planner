import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import type { TripDetails as TripDetailsData } from "@trip/backend/types";
import { useMutation, useQuery } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, Alert, SectionList, Text, View } from "react-native";
import { Button } from "@/components/button";
import { ActivityCard } from "./activity-card";
import { DayHeader } from "./day-header";
import { TripHero } from "./trip-hero";

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
  const sections = trip.subTrips.map((subTrip) => ({ ...subTrip, data: subTrip.activities }));

  return (
    <SectionList
      className="flex-1 bg-background"
      sections={sections}
      keyExtractor={(activity) => activity._id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={<TripHero trip={trip} />}
      renderSectionHeader={({ section }) => <DayHeader subTrip={section} />}
      renderItem={({ item, index, section }) => (
        <ActivityCard
          activity={item}
          tripId={trip._id}
          isLast={index === section.data.length - 1}
        />
      )}
      renderSectionFooter={({ section }) =>
        section.data.length === 0 ? (
          <Text className="mx-6 mb-4 text-muted-foreground">Nothing planned for this day yet.</Text>
        ) : null
      }
      ListFooterComponent={<DeleteTrip tripId={trip._id} title={trip.title} />}
      contentContainerClassName="pb-16"
    />
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
    <View className="mt-6 px-4">
      <Button variant="danger" icon="trash" onPress={confirm}>
        Delete trip
      </Button>
    </View>
  );
}
