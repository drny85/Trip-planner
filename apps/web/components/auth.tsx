"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import type { ReactNode } from "react";
import { authEnabled } from "./providers";

/** Shows children to signed-in users (or everyone in demo mode), and a sign-in prompt otherwise. */
export function RequireAuth({ children }: { children: ReactNode }) {
  if (!authEnabled) return <>{children}</>;
  return (
    <>
      <AuthLoading>
        <p className="p-8 text-center text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
          <h1 className="text-3xl font-bold">Sign in to see your trips</h1>
          <SignInButton mode="modal">
            <button className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90">
              Sign in
            </button>
          </SignInButton>
        </div>
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

export function AccountButton() {
  if (!authEnabled) {
    return <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Demo mode</span>;
  }
  return (
    <>
      <Unauthenticated>
        <SignInButton mode="modal">
          <button className="text-sm font-semibold text-primary hover:underline">Sign in</button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <UserButton />
      </Authenticated>
    </>
  );
}
