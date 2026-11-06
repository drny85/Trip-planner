import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { GroupPlan } from "@/screens/group-plan";

export default function GroupPlanRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <GroupPlan tripId={tripId as Id<"trips">} />;
}
