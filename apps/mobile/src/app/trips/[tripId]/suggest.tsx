import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { SuggestIdea } from "@/screens/suggest-idea";

export default function SuggestRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <SuggestIdea tripId={tripId as Id<"trips">} />;
}
