import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * The iOS system permission prompts, in every app language.
 * They go to `locales` below, and prebuild writes them to each
 * language's InfoPlist.strings, so a Spanish phone sees the prompt in Spanish.
 */
type Prompts = {
  location: string;
  locationAlways: string;
  photos: string;
  savePhotos: string;
  camera: string;
  calendar: string;
  reminders: string;
};

const permissionStrings: Record<"en" | "es" | "fr" | "pt" | "de" | "ja", Prompts> = {
  en: {
    location: "Trip Planner uses your location while the app is open to show how long it takes to get to your next stop.",
    locationAlways: "Trip Planner uses your location in the background to keep today's plan and directions up to date while you travel.",
    photos: "Trip Planner lets you add photos from your library to your trip and save your trip memories.",
    savePhotos: "Trip Planner saves your trip photos to your library.",
    camera: "Trip Planner lets you take photos to add to the activities on your trips.",
    calendar: "Trip Planner adds your trip's activities to your calendar.",
    reminders: "Trip Planner can add reminders for your trip's activities.",
  },
  es: {
    location: "Trip Planner usa tu ubicación mientras la app está abierta para mostrarte cuánto tardas en llegar a tu próxima parada.",
    locationAlways: "Trip Planner usa tu ubicación en segundo plano para mantener al día el plan de hoy y las indicaciones mientras viajas.",
    photos: "Trip Planner te permite añadir fotos de tu fototeca a tu viaje y guardar los recuerdos del viaje.",
    savePhotos: "Trip Planner guarda las fotos de tu viaje en tu fototeca.",
    camera: "Trip Planner te permite hacer fotos para añadirlas a las actividades de tus viajes.",
    calendar: "Trip Planner añade las actividades de tu viaje a tu calendario.",
    reminders: "Trip Planner puede añadir recordatorios para las actividades de tu viaje.",
  },
  fr: {
    location: "Trip Planner utilise votre position lorsque l'app est ouverte pour indiquer le temps nécessaire pour rejoindre votre prochaine étape.",
    locationAlways: "Trip Planner utilise votre position en arrière-plan pour tenir à jour le programme du jour et l'itinéraire pendant votre voyage.",
    photos: "Trip Planner vous permet d'ajouter des photos de votre photothèque à votre voyage et d'enregistrer vos souvenirs.",
    savePhotos: "Trip Planner enregistre les photos de votre voyage dans votre photothèque.",
    camera: "Trip Planner vous permet de prendre des photos à ajouter aux activités de vos voyages.",
    calendar: "Trip Planner ajoute les activités de votre voyage à votre calendrier.",
    reminders: "Trip Planner peut ajouter des rappels pour les activités de votre voyage.",
  },
  pt: {
    location: "O Trip Planner usa sua localização enquanto o app está aberto para mostrar quanto tempo leva até sua próxima parada.",
    locationAlways: "O Trip Planner usa sua localização em segundo plano para manter o plano de hoje e as rotas atualizados durante a viagem.",
    photos: "O Trip Planner permite adicionar fotos da sua biblioteca à viagem e salvar as lembranças da viagem.",
    savePhotos: "O Trip Planner salva as fotos da sua viagem na sua biblioteca.",
    camera: "O Trip Planner permite tirar fotos para adicionar às atividades das suas viagens.",
    calendar: "O Trip Planner adiciona as atividades da sua viagem ao seu calendário.",
    reminders: "O Trip Planner pode adicionar lembretes para as atividades da sua viagem.",
  },
  de: {
    location: "Trip Planner verwendet deinen Standort, während die App geöffnet ist, um zu zeigen, wie lange du zum nächsten Stopp brauchst.",
    locationAlways: "Trip Planner verwendet deinen Standort im Hintergrund, damit der heutige Plan und die Wegbeschreibung unterwegs aktuell bleiben.",
    photos: "Mit Trip Planner kannst du Fotos aus deiner Mediathek zu deiner Reise hinzufügen und deine Reiseerinnerungen sichern.",
    savePhotos: "Trip Planner speichert deine Reisefotos in deiner Mediathek.",
    camera: "Mit Trip Planner kannst du Fotos aufnehmen und zu den Aktivitäten deiner Reisen hinzufügen.",
    calendar: "Trip Planner trägt die Aktivitäten deiner Reise in deinen Kalender ein.",
    reminders: "Trip Planner kann Erinnerungen für die Aktivitäten deiner Reise hinzufügen.",
  },
  ja: {
    location: "Trip Planner はアプリの使用中に位置情報を使い、次の目的地までの所要時間を表示します。",
    locationAlways: "Trip Planner はバックグラウンドでも位置情報を使い、旅行中に今日の予定と経路を最新に保ちます。",
    photos: "Trip Planner では、ライブラリの写真を旅行に追加したり、旅の思い出を保存したりできます。",
    savePhotos: "Trip Planner は旅行の写真をライブラリに保存します。",
    camera: "Trip Planner では、写真を撮って旅行のアクティビティに追加できます。",
    calendar: "Trip Planner は旅行のアクティビティをカレンダーに追加します。",
    reminders: "Trip Planner は旅行のアクティビティのリマインダーを追加できます。",
  },
};

/** Info.plist usage-description keys for one language. */
function iosPrompts(p: Prompts) {
  return {
    NSLocationWhenInUseUsageDescription: p.location,
    NSLocationAlwaysAndWhenInUseUsageDescription: p.locationAlways,
    NSLocationAlwaysUsageDescription: p.locationAlways,
    NSPhotoLibraryUsageDescription: p.photos,
    NSPhotoLibraryAddUsageDescription: p.savePhotos,
    NSCameraUsageDescription: p.camera,
    NSCalendarsUsageDescription: p.calendar,
    NSCalendarsFullAccessUsageDescription: p.calendar,
    NSRemindersUsageDescription: p.reminders,
    NSRemindersFullAccessUsageDescription: p.reminders,
  };
}

const en = permissionStrings.en;

/**
 * Expo app config. Native behavior (permissions, background modes, plugins)
 * lives here; ios/ and android/ are generated from it, never edited by hand.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Trip Planner",
  slug: "trip-planner",
  owner: "drny85",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "tripplanner",
  userInterfaceStyle: "automatic",
  ios: {
    icon: "./assets/expo.icon",
    bundleIdentifier: "com.tripplanner.app",
    // Lets the system prompts below follow the phone's language.
    infoPlist: { CFBundleAllowMixedLocalizations: true },
  },
  // Permission prompts in every app language (written to InfoPlist.strings at prebuild).
  locales: Object.fromEntries(Object.entries(permissionStrings).map(([lang, p]) => [lang, { ios: iosPrompts(p) }])),
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
    "@clerk/expo-native-components",
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        photosPermission: en.photos,
        cameraPermission: en.camera,
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
        locationWhenInUsePermission: en.location,
        locationAlwaysAndWhenInUsePermission: en.locationAlways,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        locationAlwaysPermission: en.locationAlways,
      },
    ],
    [
      "expo-calendar",
      {
        calendarPermission: en.calendar,
        remindersPermission: en.reminders,
      },
    ],
    [
      "expo-maps",
      {
        requestLocationPermission: true,
        locationPermission: en.location,
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission: en.photos,
        savePhotosPermission: en.savePhotos,
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
    // EAS project @drny85/trip-planner. Push notifications, EAS Build and EAS Update need it.
    // It isn't a secret; EAS_PROJECT_ID overrides it (for example for a fork).
    eas: { projectId: process.env.EAS_PROJECT_ID || "1bd2c08c-4ba8-4bc7-bb5a-757bc74e0537" },
  },
});
