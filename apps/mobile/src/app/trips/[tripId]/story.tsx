import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { TripStory } from "@/screens/trip-story";

export default function StoryRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <TripStory tripId={tripId as Id<"trips">} />;
}
