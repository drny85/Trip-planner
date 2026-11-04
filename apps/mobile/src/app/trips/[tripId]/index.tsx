import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { TripDetails } from "@/screens/trip-details";

export default function TripRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <TripDetails tripId={tripId as Id<"trips">} />;
}
