import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Expo app config. Native behavior (permissions, background modes, plugins)
 * lives here; ios/ and android/ are generated from it, never edited by hand.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Trip Planner",
  slug: "trip-planner",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "tripplanner",
  userInterfaceStyle: "automatic",
  ios: {
    icon: "./assets/expo.icon",
    bundleIdentifier: "com.tripplanner.app",
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#0e7c66",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: "com.tripplanner.app",
  },
  web: {
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0e7c66",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    "@clerk/expo",
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        photosPermission: "Trip Planner lets you add photos from your library to the activities on your trips.",
        cameraPermission: "Trip Planner lets you take photos to add to the activities on your trips.",
      },
    ],
    [
      "expo-notifications",
      {
        color: "#0e7c66",
      },
    ],
    [
      "expo-localization",
      {
        supportedLocales: {
          ios: ["en", "es", "fr", "pt", "de", "ja"],
          android: ["en", "es", "fr", "pt", "de", "ja"],
        },
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "Trip Planner uses your location while the app is open to show how long it takes to get to your next stop.",
        locationAlwaysAndWhenInUsePermission:
          "Trip Planner uses your location in the background to keep today's plan and directions up to date while you travel.",
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        locationAlwaysPermission:
          "Trip Planner uses your location in the background to keep today's plan and directions up to date while you travel.",
      },
    ],
    [
      "expo-calendar",
      {
        calendarPermission: "Trip Planner adds your trip's activities to your calendar.",
        remindersPermission: "Trip Planner can add reminders for your trip's activities.",
      },
    ],
    [
      "expo-maps",
      {
        requestLocationPermission: true,
        locationPermission: "Trip Planner shows your location on the day's map.",
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission: "Trip Planner lets you pick trip photos and save your trip memories to your library.",
        savePhotosPermission: "Trip Planner saves your trip photos to your library.",
        isAccessMediaLocationEnabled: true,
      },
    ],
    "expo-document-picker",
    "expo-apple-authentication",
    "expo-dev-client",
    "expo-updates",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ...config.extra,
    // Set after `eas init`; push notifications and EAS Update need it.
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
});
