"use client";

import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { useI18n } from "@trip/i18n/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { rise } from "@/lib/motion";
import { AuthBackdrop, AuthShowcase, LockIcon } from "./auth-showcase";
import { authEnabled } from "./providers";

type GateReason = "trips" | "plan" | "trip";

const GATE_COPY = {
  trips: { title: "auth.signInToSeeTrips", body: "auth.tripsBody" },
  plan: { title: "auth.planTitle", body: "auth.planBody" },
  trip: { title: "auth.tripTitle", body: "auth.tripBody" },
} as const;

const PERKS = [
  { key: "auth.perkPlan", icon: "✨" },
  { key: "auth.perkSync", icon: "📱" },
  { key: "auth.perkCrew", icon: "🧑‍🤝‍🧑" },
] as const;

/**
 * Shows children to signed-in users (or everyone in demo mode). Signed-out visitors get a
 * full-width prompt whose copy fits the page they tried to open.
 */
export function RequireAuth({ children, reason = "trips" }: { children: ReactNode; reason?: GateReason }) {
  if (!authEnabled) return <>{children}</>;
  return (
    <>
      <AuthLoading>
        <GateSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <SignInGate reason={reason} />
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

function SignInGate({ reason }: { reason: GateReason }) {
  const { t } = useI18n();
  const copy = GATE_COPY[reason];
  return (
    <section className="relative isolate w-full">
      <AuthBackdrop />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.05fr_1fr] lg:py-12">
        <div className="flex flex-col items-start gap-6">
          <motion.span {...rise(0)} className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            <LockIcon className="h-3.5 w-3.5" />
            {t("auth.badge")}
          </motion.span>
          <motion.h1 {...rise(1)} className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
            {t(copy.title)}
          </motion.h1>
          <motion.p {...rise(2)} className="max-w-lg text-pretty text-lg text-muted-foreground">
            {t(copy.body)}
          </motion.p>
          <motion.ul {...rise(3)} className="flex flex-col gap-3">
            {PERKS.map((p) => (
              <li key={p.key} className="flex items-center gap-3 font-medium">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-lg shadow-sm">{p.icon}</span>
                {t(p.key)}
              </li>
            ))}
          </motion.ul>
          <motion.div {...rise(4)} className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <SignInButton mode="modal">
              <button className="shine group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-primary px-7 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:shadow-xl hover:shadow-primary/30 active:scale-[0.97]">
                {t("nav.signIn")}
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-full border border-border bg-card/70 px-7 py-3 font-semibold backdrop-blur transition hover:bg-muted active:scale-[0.97]">
                {t("auth.createAccount")}
              </button>
            </SignUpButton>
          </motion.div>
          <motion.p {...rise(5)} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{t("auth.noCard")}</span>
            <span aria-hidden className="hidden sm:inline">·</span>
            <Link href="/" className="font-semibold text-foreground underline-offset-4 hover:underline">
              {t("auth.backHome")}
            </Link>
          </motion.p>
        </div>
        <div className="hidden sm:block">
          <AuthShowcase />
        </div>
      </div>
    </section>
  );
}

/** Placeholder with the gate's shape while Clerk works out whether someone is signed in. */
function GateSkeleton() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t("common.loading")} className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr]">
      <div className="flex flex-col gap-5">
        {["h-7 w-36 rounded-full", "h-12 w-4/5 rounded-2xl", "h-5 w-full max-w-md rounded-lg", "h-5 w-2/3 rounded-lg", "h-12 w-56 rounded-full"].map((c) => (
          <div key={c} className={`relative overflow-hidden bg-muted ${c}`}>
            <div className="shimmer absolute inset-0" />
          </div>
        ))}
      </div>
      <div className="relative hidden h-[26rem] overflow-hidden rounded-3xl bg-muted sm:block">
        <div className="shimmer absolute inset-0" />
      </div>
    </div>
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
          <button className="rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-muted active:scale-[0.97]">{t("nav.signIn")}</button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <UserButton />
      </Authenticated>
    </>
  );
}
