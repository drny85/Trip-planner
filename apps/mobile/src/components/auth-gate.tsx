import { useAuth, useSession, useUser } from "@clerk/expo";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { AuthView, UserProfileView } from "@clerk/expo/native-components";
import { useI18n } from "@trip/i18n/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { authEnabled } from "@/providers/app-providers";
import { clearCache } from "@/lib/offline-cache";
import { Image } from "./image";
import { Welcome } from "./welcome";

/** Renders children for signed-in users (or everyone in demo mode) and the welcome tour otherwise. */
export function AuthGate({ children }: { children: ReactNode }) {
  if (!authEnabled) return <>{children}</>;
  return <ClerkGate>{children}</ClerkGate>;
}

function ClerkGate({ children }: { children: ReactNode }) {
  const [authOpen, setAuthOpen] = useState(false);
  const { session } = useSession();
  // Native components need pending sessions (MFA and other session tasks) to count as signed in.
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const active = isSignedIn && session?.status === "active";
  // Close the sheet once sign-in has fully finished, and forget that it was open, so it doesn't
  // pop up again by itself after a later sign-out. (State adjusted during render, not in an effect.)
  if (authOpen && active) setAuthOpen(false);

  // Signing out can happen in Clerk's native profile sheet, so clear the offline cache on
  // any signed-in → signed-out change rather than in a button handler.
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (wasSignedIn.current && isSignedIn === false) clearCache();
    if (isSignedIn !== undefined) wasSignedIn.current = isSignedIn;
  }, [isSignedIn]);

  return (
    <>
      <AuthLoading>
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator />
        </View>
      </AuthLoading>
      <Unauthenticated>
        <SignInScreen onOpenAuth={() => setAuthOpen(true)} />
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
      {/* Clerk's native sign-in (SwiftUI / Jetpack Compose). Mounted beside, not inside, the
          signed-out screen, so it isn't torn down while session tasks are still finishing. */}
      {Platform.OS !== "web" && (
        <Modal
          visible={authOpen && !active}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setAuthOpen(false)}
        >
          <AuthView onDismiss={() => setAuthOpen(false)} />
        </Modal>
      )}
    </>
  );
}

/** The welcome tour, with sign-in behind "Get started" or "Plan your own trip". */
function SignInScreen({ onOpenAuth }: { onOpenAuth: () => void }) {
  const { startHostedAuth } = useHostedAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();

  // On iOS and Android, Clerk's native sheet; on web there is no native view, so the hosted page.
  const signIn = async () => {
    if (Platform.OS !== "web") return onOpenAuth();
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

  return <Welcome onSignIn={() => void signIn()} busy={busy} error={error} />;
}

/** The account button in the header (hidden in demo mode). */
export function SignOutButton() {
  if (!authEnabled) return null;
  return <SignOutButtonInner />;
}

/**
 * The signed-in person's photo or initials. On iOS and Android, tapping it opens
 * Clerk's native profile sheet (account, security, sign out) in a page sheet.
 * Clerk's UserButton isn't used because, inside a navigation header, its SwiftUI
 * navigation takes over the screen's header. The web asks to sign out.
 */
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
  const [profileOpen, setProfileOpen] = useState(false);
  const ask = () =>
    Platform.OS !== "web"
      ? setProfileOpen(true)
      : Alert.alert(name || t("mobile.yourAccount"), undefined, [
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
    <>
      <Pressable
        onPress={ask}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          name
            ? t("mobile.accountLabelNamed", { name })
            : t("mobile.accountLabel")
        }
        style={{ width: 32, height: 32 }}
        className="overflow-hidden rounded-full bg-primary active:opacity-70"
      >
        {user?.hasImage ? (
          <Image
            source={user.imageUrl}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-xs font-bold text-primary-foreground">
              {initials}
            </Text>
          </View>
        )}
      </Pressable>
      {Platform.OS !== "web" && (
        <Modal
          visible={profileOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setProfileOpen(false)}
        >
          <UserProfileView
            onDismiss={() => setProfileOpen(false)}
            style={{ flex: 1 }}
          />
        </Modal>
      )}
    </>
  );
}
