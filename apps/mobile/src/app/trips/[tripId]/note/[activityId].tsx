import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { NoteEditor } from "@/screens/note-editor";

export default function NoteRoute() {
  const { tripId, activityId } = useLocalSearchParams<{ tripId: string; activityId: string }>();
  return <NoteEditor tripId={tripId as Id<"trips">} activityId={activityId as Id<"activities">} />;
}
