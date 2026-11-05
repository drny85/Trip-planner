"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { api } from "@trip/backend/api";
import { useI18n } from "@trip/i18n/react";
import { UndoToastProvider } from "./undo-toast";
import { ConvexProvider, ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { MotionConfig } from "motion/react";
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
  if (!convex) return <MissingConfig />;
  if (!clerkKey)
    return (
      <ConvexProvider client={convex}>
        <SyncLanguage />
        {children}
      </ConvexProvider>
    );
  return (
    <ClerkProvider publishableKey={clerkKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SyncUser />
        <SyncLanguage />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

function SyncUser() {
  const { isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  useEffect(() => {
    if (isAuthenticated) void store();
  }, [isAuthenticated, store]);
  return null;
}

/** Saves the chosen language on the account, so notifications and AI trips use it too. */
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
