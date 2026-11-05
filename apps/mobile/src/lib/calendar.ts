import { toICS } from "@trip/ui";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/** Writes the itinerary to an .ics file and opens the share sheet, so it can go to Calendar. */
export async function shareCalendar(trip: Parameters<typeof toICS>[0]) {
  const file = new File(Paths.cache, `${trip.title.replace(/[^\w-]+/g, "-").toLowerCase() || "trip"}.ics`);
  if (file.exists) file.delete();
  file.create();
  await file.write(toICS(trip));
  await Sharing.shareAsync(file.uri, { mimeType: "text/calendar", UTI: "public.calendar-event", dialogTitle: "Add to calendar" });
}
