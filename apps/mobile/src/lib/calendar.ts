import { fileSlug } from "@trip/i18n/itinerary";
import { toICS } from "@trip/ui";
import { File, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import {
  CalendarAccessError,
  canUseDeviceCalendar,
  NoCalendarError,
  openSettings,
  removeTripFromCalendar,
  syncedCalendar,
  syncTripToCalendar,
} from "./device-calendar";
import { i18nNow } from "./i18n";

/** Writes the itinerary to an .ics file and opens the share sheet, so it can go to Calendar. */
export async function shareCalendar(trip: Parameters<typeof toICS>[0]) {
  const file = new File(Paths.cache, `${fileSlug(trip.title)}.ics`);
  if (file.exists) file.delete();
  file.create();
  await file.write(toICS(trip));
  await Sharing.shareAsync(file.uri, { mimeType: "text/calendar", UTI: "public.calendar-event", dialogTitle: i18nNow().t("trip.addToCalendar") });
}

type AlertButton = { text: string; style?: "cancel" | "destructive"; onPress?: () => void };

/**
 * "Add to calendar": straight into the phone's calendar (kept up to date on
 * later taps), or as an .ics file. Errors are shown here.
 */
export function addToCalendar(trip: Parameters<typeof toICS>[0]) {
  const { t } = i18nNow();
  const fail = (e: unknown) => {
    if (e instanceof CalendarAccessError) {
      Alert.alert(t("deviceCalendar.noAccessTitle"), t("deviceCalendar.noAccessBody"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("deviceCalendar.openSettings"), onPress: openSettings },
      ]);
    } else if (e instanceof NoCalendarError) Alert.alert(t("mobile.couldntExport"), t("deviceCalendar.noCalendar"));
    else Alert.alert(t("mobile.couldntExport"), e instanceof Error ? e.message : undefined);
  };
  const share = () => void shareCalendar(trip).catch(fail);
  if (!canUseDeviceCalendar) return share();

  const synced = syncedCalendar(trip._id);
  const sync = () =>
    void syncTripToCalendar(trip)
      .then((r) => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t("trip.addToCalendar"), r.firstTime ? t("deviceCalendar.added", { count: r.count, calendar: r.calendar }) : t("deviceCalendar.updated", { calendar: r.calendar }));
      })
      .catch(fail);
  const remove = () =>
    void removeTripFromCalendar(trip._id)
      .then(() => Alert.alert(t("trip.addToCalendar"), t("deviceCalendar.removed")))
      .catch(fail);

  const buttons: AlertButton[] = [{ text: synced ? t("deviceCalendar.updatePhone") : t("deviceCalendar.addToPhone"), onPress: sync }];
  // Android alerts hold three buttons, so the file option makes way for "Remove" there.
  if (!synced || Platform.OS !== "android") buttons.push({ text: t("deviceCalendar.shareFile"), onPress: share });
  if (synced) buttons.push({ text: t("deviceCalendar.remove"), style: "destructive", onPress: remove });
  buttons.push({ text: t("common.cancel"), style: "cancel" });
  Alert.alert(t("deviceCalendar.chooseTitle"), t("deviceCalendar.chooseBody"), buttons);
}
