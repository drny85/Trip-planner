import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { BudgetOverviewScreen } from "@/screens/budget-overview";

export default function BudgetRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <BudgetOverviewScreen tripId={tripId as Id<"trips">} />;
}
