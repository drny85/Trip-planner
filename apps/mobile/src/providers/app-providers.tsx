import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { api } from "@trip/backend/api";
import { useI18n } from "@trip/i18n/react";
import { ConvexProvider, ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, type ReactNode } from "react";
import { Text, View } from "react-native";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** Sign-in is on only when a Clerk key is configured; otherwise the app runs in demo mode. */
export const authEnabled = Boolean(clerkKey);

const convex = convexUrl ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false }) : null;

export function AppProviders({ children }: { children: ReactNode }) {
  if (!convex) return <MissingConfig />;

  if (!clerkKey) {
    return (
      <ConvexProvider client={convex}>
        <SyncLanguage />
        {children}
      </ConvexProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkKey} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SyncUser />
        <SyncLanguage />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

/** Keeps the Convex `users` row in step with the signed-in Clerk user. */
function SyncUser() {
  const { isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  useEffect(() => {
    if (isAuthenticated) void store();
  }, [isAuthenticated, store]);
  return null;
}

/** Saves the app language on the account, so notifications and AI trips use it too. */
function SyncLanguage() {
  const { locale } = useI18n();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const setLanguage = useMutation(api.users.setLanguage);
  const ready = !isLoading && (isAuthenticated || !authEnabled);
  useEffect(() => {
    if (ready) void setLanguage({ language: locale }).catch(() => {});
  }, [ready, locale, setLanguage]);
  return null;
}

function MissingConfig() {
  const { t } = useI18n();
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background p-8">
      <Text className="text-xl font-bold text-foreground">{t("config.connectBackend")}</Text>
      <Text className="text-center text-muted-foreground">{t("config.mobileHint")}</Text>
    </View>
  );
}
