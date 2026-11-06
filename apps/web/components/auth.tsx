"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { useI18n } from "@trip/i18n/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import type { ReactNode } from "react";
import { authEnabled } from "./providers";

/** Shows children to signed-in users (or everyone in demo mode), and a sign-in prompt otherwise. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  if (!authEnabled) return <>{children}</>;
  return (
    <>
      <AuthLoading>
        <p className="p-8 text-center text-muted-foreground">{t("common.loading")}</p>
      </AuthLoading>
      <Unauthenticated>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
          <h1 className="text-3xl font-bold">{t("auth.signInToSeeTrips")}</h1>
          <SignInButton mode="modal">
            <button className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90">
              {t("nav.signIn")}
            </button>
          </SignInButton>
        </div>
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

export function AccountButton() {
  const { t } = useI18n();
  if (!authEnabled) {
    return <span className="hidden rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground sm:inline">{t("nav.demoMode")}</span>;
  }
  return (
    <>
      <Unauthenticated>
        <SignInButton mode="modal">
          <button className="text-sm font-semibold text-primary hover:underline">{t("nav.signIn")}</button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <UserButton />
      </Authenticated>
    </>
  );
}
