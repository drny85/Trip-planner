import { useAuth, useUser } from "@clerk/expo";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { useI18n } from "@trip/i18n/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { authEnabled } from "@/providers/app-providers";
import { clearCache } from "@/lib/offline-cache";
import { Button } from "./button";
import { Image } from "./image";

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
  const { t } = useI18n();

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await startHostedAuth();
    } catch {
      setError(t("mobile.signInFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 justify-center gap-6 bg-background p-8">
      <View className="gap-2">
        <Text className="text-4xl font-extrabold text-foreground">{t("mobile.signInTitle")}</Text>
        <Text className="text-lg text-muted-foreground">{t("mobile.signInBody")}</Text>
      </View>
      <Button icon="sparkles" onPress={signIn} loading={busy}>
        {t("mobile.signInStart")}
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

/** The signed-in person's photo or initials; tapping it offers Sign out. */
function SignOutButtonInner() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { t } = useI18n();
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "";
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  const ask = () =>
    Alert.alert(name || t("mobile.yourAccount"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("mobile.signOut"),
        style: "destructive",
        onPress: () => {
          clearCache();
          void signOut();
        },
      },
    ]);
  return (
    <Pressable onPress={ask} hitSlop={8} accessibilityRole="button" accessibilityLabel={name ? t("mobile.accountLabelNamed", { name }) : t("mobile.accountLabel")} style={{ width: 32, height: 32 }} className="overflow-hidden rounded-full bg-primary active:opacity-70">
      {user?.hasImage ? (
        <Image source={user.imageUrl} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      ) : (
        <View className="flex-1 items-center justify-center">
          <Text className="text-xs font-bold text-primary-foreground">{initials}</Text>
        </View>
      )}
    </Pressable>
  );
}
