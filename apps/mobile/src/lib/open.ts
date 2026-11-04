import { links } from "@trip/ui";
import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";

type Place = { address: string; latitude?: number; longitude?: number; title?: string };

/** Opens the phone dialer. */
export const callPhone = (phone: string) => Linking.openURL(links.phone(phone));

/** Opens turn-by-turn directions in the platform's maps app, falling back to Google Maps on the web. */
export async function openDirections(place: Place) {
  const hasCoords = place.latitude != null && place.longitude != null;
  const query = encodeURIComponent(hasCoords ? `${place.latitude},${place.longitude}` : place.address);
  const label = encodeURIComponent(place.title ?? place.address);

  const nativeUrl = Platform.select({
    ios: `maps://?daddr=${query}`,
    android: hasCoords ? `geo:${place.latitude},${place.longitude}?q=${query}(${label})` : `geo:0,0?q=${query}`,
  });

  if (nativeUrl && (await Linking.canOpenURL(nativeUrl))) return Linking.openURL(nativeUrl);
  return Linking.openURL(links.directions(place));
}

/** Opens a booking or website page in an in-app browser sheet. */
export const openInAppBrowser = (url: string) =>
  WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  });
