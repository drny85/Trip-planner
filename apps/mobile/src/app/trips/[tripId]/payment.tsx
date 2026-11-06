import type { Id } from "@trip/backend/dataModel";
import { useLocalSearchParams } from "expo-router";
import { RecordPayment } from "@/screens/record-payment";

export default function PaymentRoute() {
  const { tripId, from, to } = useLocalSearchParams<{ tripId: string; from: string; to: string }>();
  return <RecordPayment tripId={tripId as Id<"trips">} from={from} to={to} />;
}
