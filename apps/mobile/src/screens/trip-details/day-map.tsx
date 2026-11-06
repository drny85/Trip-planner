import type { Activity } from "@trip/backend/types";
import { getCategory, hasCoords } from "@trip/ui";
import Constants from "expo-constants";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { Platform, useColorScheme, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { openDirections } from "@/lib/open";

/**
 * Apple Maps on iOS; Google Maps on Android once an API key is configured
 * (GOOGLE_MAPS_ANDROID_API_KEY at build time). Without one, and on web, the
 * day keeps its "Route" link only.
 */
export const nativeMapsAvailable =
  Platform.OS === "ios" || (Platform.OS === "android" && Boolean(Constants.expoConfig?.android?.config?.googleMaps?.apiKey));

/** The stops of a day that can go on a map, in order. */
export const mappableStops = (activities: Activity[]) => activities.filter(hasCoords);

/** Centers on the stops and zooms so they all fit (roughly; the map clamps it). */
function cameraFor(stops: { latitude: number; longitude: number }[]) {
  const lats = stops.map((s) => s.latitude);
  const lngs = stops.map((s) => s.longitude);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = Math.max(maxLat - minLat, (maxLng - minLng) * Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)), 0.005);
  const zoom = Math.min(16, Math.max(3, Math.log2(360 / span) - 1.2));
  return { coordinates: { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2 }, zoom };
}

export function DayMap({ activities }: { activities: Activity[] }) {
  const scheme = useColorScheme();
  const stops = mappableStops(activities);
  if (stops.length === 0 || !nativeMapsAvailable) return null;

  const camera = cameraFor(stops);
  const line = [{ id: "route", coordinates: stops.map(({ latitude, longitude }) => ({ latitude, longitude })), color: scheme === "dark" ? "#2dd4aa" : "#0e7c66", width: 4 }];
  const openStop = (id?: string) => {
    const stop = stops.find((s) => s._id === id);
    if (stop) void openDirections(stop);
  };

  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)} className="mx-5 mb-4 h-60 overflow-hidden rounded-3xl border border-border">
      {Platform.OS === "ios" ? (
        <AppleMaps.View
          style={{ flex: 1 }}
          cameraPosition={camera}
          colorScheme={scheme === "dark" ? AppleMaps.MapColorScheme.DARK : AppleMaps.MapColorScheme.LIGHT}
          markers={stops.map((s, i) => ({
            id: s._id,
            coordinates: { latitude: s.latitude, longitude: s.longitude },
            title: s.title,
            monogram: String(i + 1),
            tintColor: getCategory(s.category).color,
          }))}
          polylines={line}
          uiSettings={{ compassEnabled: false, myLocationButtonEnabled: false, togglePitchEnabled: false }}
          onMarkerClick={(m) => openStop(m.id)}
        />
      ) : (
        <GoogleMaps.View
          style={{ flex: 1 }}
          cameraPosition={camera}
          colorScheme={scheme === "dark" ? GoogleMaps.MapColorScheme.DARK : GoogleMaps.MapColorScheme.LIGHT}
          markers={stops.map((s, i) => ({
            id: s._id,
            coordinates: { latitude: s.latitude, longitude: s.longitude },
            title: `${i + 1}. ${s.title}`,
            snippet: s.address,
          }))}
          polylines={line}
          uiSettings={{ mapToolbarEnabled: false, myLocationButtonEnabled: false }}
          onMarkerClick={(m) => openStop(m.id)}
        />
      )}
      {/* Keeps the hairline border above the native map on Android. */}
      <View pointerEvents="none" className="absolute inset-0 rounded-3xl border border-border" />
    </Animated.View>
  );
}
