import { useLocalSearchParams } from "expo-router";
import { JoinTrip } from "@/screens/join-trip";

/** Opened from an invite link (tripplanner://join/<token> or the web link). */
export default function JoinRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <JoinTrip token={token} />;
}
