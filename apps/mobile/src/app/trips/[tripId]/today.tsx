import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { TodayScreen } from "@/screens/today";

export default function TodayRoute() {
  const { tripId, day, go } = useLocalSearchParams<{ tripId: string; day?: string; go?: string }>();
  const n = Number(day);
  return <TodayScreen tripId={tripId as Id<"trips">} previewDay={Number.isInteger(n) && n > 0 ? n : undefined} directionsTo={go} />;
}
