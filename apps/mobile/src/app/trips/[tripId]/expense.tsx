import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { AddExpense } from "@/screens/add-expense";

export default function ExpenseRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <AddExpense tripId={tripId as Id<"trips">} />;
}
