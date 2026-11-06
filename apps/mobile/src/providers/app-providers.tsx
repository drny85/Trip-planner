import { ClerkProvider, useAuth, useUser } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { api } from "@trip/backend/api";
import { useI18n } from "@trip/i18n/react";
import { currencyFromLocales, isCurrencyCode } from "@trip/ui";
import { getLocales } from "expo-localization";
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
        <SyncLanguage ready />
        {children}
      </ConvexProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkKey} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SyncUser />
        <SyncLanguageWhenSignedIn />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

/** Keeps the Convex `users` row in step with the signed-in Clerk user. */
function SyncUser() {
  const { isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const { user } = useUser();
  const name = user?.fullName ?? user?.username ?? undefined;
  const imageUrl = user?.hasImage ? user.imageUrl : undefined;
  useEffect(() => {
    if (isAuthenticated) void store({ name, imageUrl });
  }, [isAuthenticated, store, name, imageUrl]);
  return null;
}

/** Waits for sign-in before saving the language. useConvexAuth only works under ConvexProviderWithClerk. */
function SyncLanguageWhenSignedIn() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return <SyncLanguage ready={!isLoading && isAuthenticated} />;
}

/** Saves the app language (and a first guess at the home currency) on the account. */
function SyncLanguage({ ready }: { ready: boolean }) {
  const { locale } = useI18n();
  const setLanguage = useMutation(api.users.setLanguage);
  const setHomeCurrency = useMutation(api.users.setHomeCurrency);
  useEffect(() => {
    if (ready) void setLanguage({ language: locale }).catch(() => {});
  }, [ready, locale, setLanguage]);
  // The home currency is guessed once from the phone's region settings; a choice made later wins.
  useEffect(() => {
    if (!ready) return;
    const locales = getLocales();
    const fromOs = locales[0]?.currencyCode;
    const currency = fromOs && isCurrencyCode(fromOs) ? fromOs : currencyFromLocales(locales.map((l) => l.languageTag));
    if (currency) void setHomeCurrency({ currency, onlyIfUnset: true }).catch(() => {});
  }, [ready, setHomeCurrency]);
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
