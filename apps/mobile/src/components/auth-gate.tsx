import { useAuth } from "@clerk/expo";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { authEnabled } from "@/providers/app-providers";
import { clearCache } from "@/lib/offline-cache";
import { Button } from "./button";

/** Renders children for signed-in users (or everyone in demo mode) and a sign-in screen otherwise. */
export function AuthGate({ children }: { children: ReactNode }) {
  if (!authEnabled) return <>{children}</>;
  return (
    <>
      <AuthLoading>
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator />
        </View>
      </AuthLoading>
      <Unauthenticated>
        <SignInScreen />
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

function SignInScreen() {
  const { startHostedAuth } = useHostedAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await startHostedAuth();
    } catch {
      setError("Sign-in didn't complete. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 justify-center gap-6 bg-background p-8">
      <View className="gap-2">
        <Text className="text-4xl font-extrabold text-foreground">Plan trips in seconds</Text>
        <Text className="text-lg text-muted-foreground">
          Describe where you want to go and get a day-by-day itinerary you can edit and check off.
        </Text>
      </View>
      <Button icon="sparkles" onPress={signIn} loading={busy}>
        Sign in to start
      </Button>
      {error && <Text className="text-center text-danger">{error}</Text>}
    </View>
  );
}

/** Header button that signs out (hidden in demo mode). */
export function SignOutButton() {
  if (!authEnabled) return null;
  return <SignOutButtonInner />;
}

function SignOutButtonInner() {
  const { signOut } = useAuth();
  return (
    <Button variant="ghost" size="sm" icon="logout" onPress={() => {
        clearCache();
        void signOut();
      }}>
      Sign out
    </Button>
  );
}
