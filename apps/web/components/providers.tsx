"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { api } from "@trip/backend/api";
import { ConvexProvider, ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** Sign-in is on only when Clerk keys are configured; otherwise the app runs in demo mode. */
export const authEnabled = Boolean(clerkKey);

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: ReactNode }) {
  // Motion respects the OS "reduce motion" setting everywhere.
  return (
    <MotionConfig reducedMotion="user">
      <ConvexProviders>{children}</ConvexProviders>
    </MotionConfig>
  );
}

function ConvexProviders({ children }: { children: ReactNode }) {
  if (!convex) return <MissingConfig />;
  if (!clerkKey) return <ConvexProvider client={convex}>{children}</ConvexProvider>;
  return (
    <ClerkProvider publishableKey={clerkKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SyncUser />
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

function MissingConfig() {
  return (
    <main className="mx-auto flex max-w-lg flex-1 flex-col justify-center gap-3 p-8">
      <h1 className="text-2xl font-bold">Connect your backend</h1>
      <p className="text-muted-foreground">
        Set <code className="rounded bg-muted px-1">NEXT_PUBLIC_CONVEX_URL</code> in{" "}
        <code className="rounded bg-muted px-1">apps/web/.env.local</code> to your Convex deployment URL and restart
        the dev server.
      </p>
    </main>
  );
}
