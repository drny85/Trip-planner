import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { EditActivity } from "@/screens/edit-activity";

export default function EditActivityRoute() {
  const { tripId, activityId } = useLocalSearchParams<{ tripId: string; activityId: string }>();
  return <EditActivity tripId={tripId as Id<"trips">} activityId={activityId as Id<"activities">} />;
}
