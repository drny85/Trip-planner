import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { i18nNow } from "./i18n";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/**
 * Asks for permission and returns this phone's Expo push token, or null when
 * that isn't possible (simulator, web, permission denied, or no EAS project id).
 */
export async function getPushToken() {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  if (Platform.OS === "android") {
    // eslint-disable-next-line import/namespace -- re-exported with `export *`, which the rule can't follow
    await Notifications.setNotificationChannelAsync("default", { name: i18nNow().t("mobile.channelName"), importance: Notifications.AndroidImportance.DEFAULT });
  }
  const { status } = await Notifications.getPermissionsAsync();
  const granted = status === "granted" || (await Notifications.requestPermissionsAsync()).status === "granted";
  if (!granted) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

type ReminderActivity = { _id: string; title: string; address: string; startTime?: string; children: ReminderActivity[] };
type ReminderTrip = { _id: string; title: string; startDate: string; subTrips: { date?: string; dayNumber: number; activities: ReminderActivity[] }[] };

const REMIND_BEFORE_MIN = 30;

/**
 * Schedules a local reminder 30 minutes before each timed activity of this trip
 * in the next two weeks, replacing the trip's earlier reminders. Runs on the
 * phone, so it works offline and needs no server.
 */
export async function scheduleTripReminders(trip: ReminderTrip) {
  if (Platform.OS === "web") return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.content.data?.tripId === trip._id).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  const now = Date.now();
  const horizon = now + 14 * 86_400_000;
  const jobs: Promise<string>[] = [];
  for (const day of trip.subTrips) {
    const date = day.date ?? addDays(trip.startDate, day.dayNumber - 1);
    const walk = (nodes: ReminderActivity[]) =>
      nodes.forEach((a) => {
        const at = a.startTime && /^\d{1,2}:\d{2}$/.test(a.startTime) ? new Date(`${date}T${a.startTime.padStart(5, "0")}:00`) : null;
        const fire = at ? at.getTime() - REMIND_BEFORE_MIN * 60_000 : NaN;
        if (fire > now && fire < horizon) {
          jobs.push(
            Notifications.scheduleNotificationAsync({
              content: { title: i18nNow().t("mobile.reminder", { minutes: REMIND_BEFORE_MIN, title: a.title }), body: a.address || trip.title, data: { tripId: trip._id } },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire },
            }),
          );
        }
        walk(a.children);
      });
    walk(day.activities);
  }
  await Promise.all(jobs.slice(0, 60)); // iOS keeps at most 64 pending local notifications.
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
