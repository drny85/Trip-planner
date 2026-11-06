import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { AddExpense } from "@/screens/add-expense";

export default function ExpenseRoute() {
  const { tripId, expenseId } = useLocalSearchParams<{ tripId: string; expenseId?: string }>();
  return <AddExpense tripId={tripId as Id<"trips">} expenseId={expenseId as Id<"expenses"> | undefined} />;
}
