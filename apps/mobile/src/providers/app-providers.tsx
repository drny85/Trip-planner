import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { api } from "@trip/backend/api";
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
    return <ConvexProvider client={convex}>{children}</ConvexProvider>;
  }

  return (
    <ClerkProvider publishableKey={clerkKey} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SyncUser />
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

function MissingConfig() {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background p-8">
      <Text className="text-xl font-bold text-foreground">Connect your backend</Text>
      <Text className="text-center text-muted-foreground">
        Set EXPO_PUBLIC_CONVEX_URL in apps/mobile/.env.local to your Convex deployment URL, then
        restart Expo.
      </Text>
    </View>
  );
}
