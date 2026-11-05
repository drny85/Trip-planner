import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { ImportBooking } from "@/screens/import-booking";

export default function ImportRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <ImportBooking tripId={tripId as Id<"trips">} />;
}
