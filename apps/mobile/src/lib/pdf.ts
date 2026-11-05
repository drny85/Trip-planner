import { fileSlug, itineraryHtml } from "@trip/i18n/itinerary";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { i18nNow } from "./i18n";

/**
 * Makes a printable PDF of the itinerary and opens the share sheet (Save to
 * Files, AirDrop, Mail, Print…). It uses no network, so it works from the
 * phone's saved copy of the trip too.
 */
export async function shareItineraryPdf(trip: Parameters<typeof itineraryHtml>[0]) {
  const i18n = i18nNow();
  const html = itineraryHtml(trip, i18n);
  // The browser build has no file system: print the page instead.
  if (Platform.OS === "web") return Print.printAsync({ html });

  const { uri } = await Print.printToFileAsync({ html, margins: { top: 40, right: 36, bottom: 40, left: 36 } });
  // A readable name ("tokyo-adventure.pdf") instead of a random one.
  const pdf = new File(Paths.cache, `${fileSlug(trip.title)}.pdf`);
  if (pdf.exists) pdf.delete();
  await new File(uri).move(pdf);
  await Sharing.shareAsync(pdf.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: i18n.t("print.button") });
}
