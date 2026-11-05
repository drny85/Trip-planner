import { useLocalSearchParams } from "expo-router";
import { SharedTrip } from "@/screens/shared-trip";

/** Opened from a share link (tripplanner://share/<token> or the web link): the trip and "Use this trip". */
export default function SharedTripRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <SharedTrip token={token} />;
}
