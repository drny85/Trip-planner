import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { LocalPick } from "@/screens/local-pick";

export default function LocalPickRoute() {
  const { tripId, subTripId } = useLocalSearchParams<{ tripId: string; subTripId: string }>();
  return <LocalPick tripId={tripId as Id<"trips">} subTripId={subTripId as Id<"subTrips">} />;
}
