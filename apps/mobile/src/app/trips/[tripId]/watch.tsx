import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { WatchPrice } from "@/screens/watch-price";

export default function WatchRoute() {
  const { tripId, bookingId } = useLocalSearchParams<{ tripId: string; bookingId: string }>();
  return <WatchPrice tripId={tripId as Id<"trips">} bookingId={bookingId as Id<"bookings">} />;
}
