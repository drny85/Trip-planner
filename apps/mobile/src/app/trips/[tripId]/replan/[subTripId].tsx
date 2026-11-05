import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { ReplanDay } from "@/screens/replan-day";

export default function ReplanRoute() {
  const { tripId, subTripId, reason, now } = useLocalSearchParams<{ tripId: string; subTripId: string; reason?: string; now?: string }>();
  return <ReplanDay tripId={tripId as Id<"trips">} subTripId={subTripId as Id<"subTrips">} initialReason={reason} now={now} />;
}
