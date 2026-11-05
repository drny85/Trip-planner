import "../../global.css";

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { useI18n } from "@trip/i18n/react";
import { AuthGate } from "@/components/auth-gate";
import { CloseButton } from "@/components/close-button";
import { PushSetup } from "@/components/push-setup";
import { UndoToastProvider } from "@/components/undo-toast";
import { MobileI18nProvider } from "@/lib/i18n";
import { AppProviders } from "@/providers/app-providers";

const cancel = () => <CloseButton />;

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <MobileI18nProvider>
      <AppProviders>
        <AuthGate>
          <UndoToastProvider>
          <PushSetup />
          <AppStack />
          </UndoToastProvider>
        </AuthGate>
      </AppProviders>
      </MobileI18nProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

/** The screens, with titles in the app language. */
function AppStack() {
  const { t } = useI18n();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="index" options={{ title: t("mobile.titleTrips"), headerLargeTitle: true }} />
      <Stack.Screen
        name="generate"
        options={{ title: t("nav.planWithAI"), presentation: "modal", headerLeft: cancel }}
      />
      {/* Opens from the bottom; on iOS a tap on a trip card zooms its photo in instead (Link.AppleZoom). */}
      <Stack.Screen name="trips/[tripId]/index" options={{ title: "", headerTransparent: true, animation: "slide_from_bottom" }} />
      <Stack.Screen
        name="trips/[tripId]/activity/[activityId]"
        options={{
          title: t("mobile.titleEdit"),
          presentation: "formSheet",
          sheetAllowedDetents: [0.75, 1],
          sheetGrabberVisible: true,
          headerLeft: cancel,
        }}
      />
      <Stack.Screen
        name="trips/[tripId]/suggest"
        options={{ title: t("mobile.titleSuggest"), presentation: "formSheet", sheetAllowedDetents: [0.85, 1], sheetGrabberVisible: true, headerLeft: cancel }}
      />
      <Stack.Screen
        name="trips/[tripId]/expense"
        options={{ title: t("mobile.titleExpense"), presentation: "formSheet", sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, headerLeft: cancel }}
      />
      <Stack.Screen
        name="trips/[tripId]/replan/[subTripId]"
        options={{ title: t("mobile.titleReplan"), presentation: "formSheet", sheetAllowedDetents: [0.85, 1], sheetGrabberVisible: true, headerLeft: cancel }}
      />
      <Stack.Screen name="notifications" options={{ title: t("notifications.title") }} />
      <Stack.Screen
        name="language"
        options={{ title: t("mobile.titleLanguage"), presentation: "formSheet", sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true }}
      />
      <Stack.Screen name="join/[token]" options={{ title: t("mobile.titleInvited") }} />
    </Stack>
  );
}
