"use client";

import { ClerkFailed, ClerkLoaded, ClerkLoading, SignIn, SignUp } from "@clerk/nextjs";
import { useI18n } from "@trip/i18n/react";
import { motion } from "motion/react";
import Link from "next/link";
import { EASE_OUT, rise } from "@/lib/motion";
import { AuthBackdrop } from "./auth-showcase";
import { authEnabled } from "./providers";

const PERKS = [
  { key: "auth.perkPlan", icon: "✨" },
  { key: "auth.perkSync", icon: "📱" },
  { key: "auth.perkCrew", icon: "🧑‍🤝‍🧑" },
] as const;

/** The /sign-in and /sign-up pages: brand copy beside Clerk's form, styled by clerkAppearance. */
export function AuthPage({ mode }: { mode: "signIn" | "signUp" }) {
  const { t } = useI18n();
  const title = mode === "signIn" ? t("auth.welcomeBack") : t("auth.joinTitle");
  const body = mode === "signIn" ? t("auth.signInBody") : t("auth.signUpBody");

  return (
    <section className="relative isolate w-full flex-1">
      <AuthBackdrop />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-10 sm:py-16 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1fr_auto] lg:gap-16 lg:py-10">
        <div className="flex flex-col items-start gap-5 text-left">
          <motion.h1 {...rise(0)} className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
            {title}
          </motion.h1>
          <motion.p {...rise(1)} className="max-w-md text-pretty text-lg text-muted-foreground">
            {body}
          </motion.p>
          <motion.ul {...rise(2)} className="hidden flex-col gap-3 sm:flex">
            {PERKS.map((p) => (
              <li key={p.key} className="flex items-center gap-3 font-medium">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-lg shadow-sm">{p.icon}</span>
                {t(p.key)}
              </li>
            ))}
          </motion.ul>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 }}
          className="flex justify-center lg:justify-end"
        >
          {!authEnabled ? (
            <div className="flex max-w-sm flex-col items-start gap-4 rounded-3xl border border-border bg-card p-6 shadow-2xl">
              <p className="text-muted-foreground">{t("auth.demoMode")}</p>
              <Link href="/trips" className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground">
                {t("nav.myTrips")}
              </Link>
            </div>
          ) : (
            <>
              <ClerkLoading>
                <FormSkeleton label={t("common.loading")} />
              </ClerkLoading>
              <ClerkFailed>
                <div className="flex max-w-sm flex-col items-start gap-4 rounded-3xl border border-border bg-card p-6 shadow-2xl">
                  <p className="text-muted-foreground">{t("common.somethingWrong")}</p>
                  <button onClick={() => location.reload()} className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground">
                    {t("common.retry")}
                  </button>
                </div>
              </ClerkFailed>
              <ClerkLoaded>{mode === "signIn" ? <SignIn /> : <SignUp />}</ClerkLoaded>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}

/** Card-shaped placeholder while Clerk's script loads, so the layout doesn't jump. */
function FormSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex w-[25rem] max-w-full flex-col gap-4 rounded-3xl border border-border bg-card p-8 shadow-2xl">
      {["mx-auto h-7 w-48", "mx-auto h-4 w-64", "mt-4 h-11 w-full rounded-full", "h-11 w-full rounded-full", "mt-2 h-4 w-20", "h-11 w-full", "h-11 w-full rounded-full"].map((c) => (
        <div key={c} className={`relative overflow-hidden rounded-xl bg-muted ${c}`}>
          <div className="shimmer absolute inset-0" />
        </div>
      ))}
    </div>
  );
}
