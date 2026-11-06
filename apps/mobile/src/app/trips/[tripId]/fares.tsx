import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { WatchFares } from "@/screens/watch-fares";

export default function FaresRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <WatchFares tripId={tripId as Id<"trips">} />;
}
