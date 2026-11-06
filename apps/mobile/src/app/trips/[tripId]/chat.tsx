import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { TripChatScreen } from "@/screens/trip-chat";

export default function TripChatRoute() {
  const { tripId, activityId, suggestionId } = useLocalSearchParams<{ tripId: string; activityId?: string; suggestionId?: string }>();
  return (
    <TripChatScreen
      tripId={tripId as Id<"trips">}
      initialLink={activityId ? { activityId: activityId as Id<"activities"> } : suggestionId ? { suggestionId: suggestionId as Id<"suggestions"> } : null}
    />
  );
}
