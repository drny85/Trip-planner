"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { api } from "@trip/backend/api";
import { useI18n } from "@trip/i18n/react";
import { currencyFromLocales } from "@trip/ui";
import { UndoToastProvider } from "./undo-toast";
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { MotionConfig } from "motion/react";
import { clerkAppearance, clerkLocalization } from "@/lib/clerk-appearance";
import { Fragment, useEffect, type ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** Sign-in is on only when Clerk keys are configured; otherwise the app runs in demo mode. */
export const authEnabled = Boolean(clerkKey);

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: ReactNode }) {
  // Motion respects the OS "reduce motion" setting everywhere.
  return (
    <MotionConfig reducedMotion="user">
      <ConvexProviders>
        <UndoToastProvider>{children}</UndoToastProvider>
      </ConvexProviders>
    </MotionConfig>
  );
}

function ConvexProviders({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  if (!convex) return <MissingConfig />;
  if (!clerkKey)
    return (
      <ConvexProviderWithAuth client={convex} useAuth={useNoAuth}>
        <SyncLanguage />
        {children}
      </ConvexProviderWithAuth>
    );
  return (
    <ClerkProvider
      publishableKey={clerkKey}
      appearance={clerkAppearance}
      localization={clerkLocalization[locale]}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SyncUser />
        <SyncLanguage />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

/** Demo mode has no sign-in, but useConvexAuth still needs an auth provider above it. */
const noAuth = { isLoading: false, isAuthenticated: false, fetchAccessToken: async () => null };
function useNoAuth() {
  return noAuth;
}

function SyncUser() {
  const { isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  useEffect(() => {
    if (isAuthenticated) void store();
  }, [isAuthenticated, store]);
  return null;
}

/** Saves the chosen language (and a first guess at the home currency) on the account. */
function SyncLanguage() {
  const { locale } = useI18n();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const setLanguage = useMutation(api.users.setLanguage);
  const setHomeCurrency = useMutation(api.users.setHomeCurrency);
  const ready = !isLoading && (isAuthenticated || !authEnabled);
  useEffect(() => {
    if (ready) void setLanguage({ language: locale }).catch(() => {});
  }, [ready, locale, setLanguage]);
  // The home currency is guessed once from the browser's region; a choice made later wins.
  useEffect(() => {
    const currency = ready ? currencyFromLocales(navigator.languages ?? [navigator.language]) : null;
    if (currency) void setHomeCurrency({ currency, onlyIfUnset: true }).catch(() => {});
  }, [ready, setHomeCurrency]);
  return null;
}

function MissingConfig() {
  const { t } = useI18n();
  const [before, middle, after] = t("config.webHint").split(/\{env\}|\{file\}/);
  return (
    <main className="mx-auto flex max-w-lg flex-1 flex-col justify-center gap-3 p-8">
      <h1 className="text-2xl font-bold">{t("config.connectBackend")}</h1>
      <p className="text-muted-foreground">
        <Fragment>{before}</Fragment>
        <code className="rounded bg-muted px-1">NEXT_PUBLIC_CONVEX_URL</code>
        {middle}
        <code className="rounded bg-muted px-1">apps/web/.env.local</code>
        {after}
      </p>
    </main>
  );
}
