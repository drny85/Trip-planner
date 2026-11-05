import "../../global.css";

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { AuthGate } from "@/components/auth-gate";
import { AppProviders } from "@/providers/app-providers";

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <AppProviders>
        <AuthGate>
          <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
            <Stack.Screen name="index" options={{ title: "My Trips", headerLargeTitle: true }} />
            <Stack.Screen
              name="generate"
              options={{ title: "Plan with AI", presentation: "modal" }}
            />
            <Stack.Screen name="trips/[tripId]/index" options={{ title: "", headerTransparent: true }} />
            <Stack.Screen
              name="trips/[tripId]/activity/[activityId]"
              options={{
                title: "Edit activity",
                presentation: "formSheet",
                sheetAllowedDetents: [0.75, 1],
                sheetGrabberVisible: true,
              }}
            />
            <Stack.Screen
              name="trips/[tripId]/suggest"
              options={{ title: "Suggest an idea", presentation: "formSheet", sheetAllowedDetents: [0.85, 1], sheetGrabberVisible: true }}
            />
            <Stack.Screen
              name="trips/[tripId]/expense"
              options={{ title: "Add an expense", presentation: "formSheet", sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true }}
            />
            <Stack.Screen name="join/[token]" options={{ title: "You're invited" }} />
          </Stack>
        </AuthGate>
      </AppProviders>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
