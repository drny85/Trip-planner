import { api } from "@trip/backend/api";
import { useMutation } from "convex/react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { getPushToken } from "@/lib/notifications";

/** Registers this phone for push and opens the trip when a notification is tapped. */
export function PushSetup() {
  const register = useMutation(api.notifications.registerPushToken);
  const router = useRouter();

  useEffect(() => {
    getPushToken()
      .then((token) => token && register({ token }))
      .catch(() => undefined);
  }, [register]);

  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const data = last?.notification.request.content.data;
    const tripId = data?.tripId;
    if (typeof tripId !== "string") return;
    // A chat push opens the chat itself.
    if (data?.screen === "chat") router.push({ pathname: "/trips/[tripId]/chat", params: { tripId } });
    else router.push({ pathname: "/trips/[tripId]", params: { tripId } });
  }, [last, router]);

  return null;
}
