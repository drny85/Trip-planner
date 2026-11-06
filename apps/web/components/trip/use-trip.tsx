"use client";

import { SignInButton } from "@clerk/nextjs";
import { api } from "@trip/backend/api";
import type { PublicTripDetails } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { copyEnd, localToday, suggestedCopyStart, TRAVELER_PRICE } from "@trip/ui";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EASE_OUT } from "@/lib/motion";
import { authEnabled } from "../providers";

/** Remembers, across the sign-in modal, that the viewer wanted to copy this trip. */
const pendingKey = (token: string) => `use-trip:${token}`;
function readPending(token: string) {
  try {
    const pending = sessionStorage.getItem(pendingKey(token)) === "1";
    sessionStorage.removeItem(pendingKey(token));
    return pending;
  } catch {
    return false;
  }
}

const styles = {
  hero: "flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary shadow-lg transition hover:bg-white/90 active:scale-[0.97]",
  banner: "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.97]",
};

/**
 * "Use this trip" on a shared itinerary: copies it to the viewer's trips with
 * their own dates. Signed-out viewers sign in first, then the dialog opens.
 */
export function UseTripButton({ token, trip, variant }: { token: string; trip: PublicTripDetails; variant: "hero" | "banner" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const label = (
    <>
      <span aria-hidden>⧉</span> {t("copyTrip.useThisTrip")}
    </>
  );
  const button = (
    <button onClick={() => setOpen(true)} className={styles[variant]}>
      {label}
    </button>
  );
  if (!authEnabled) return <>{button}<CopyDialog open={open} onClose={() => setOpen(false)} token={token} trip={trip} /></>;
  return (
    <>
      <Unauthenticated>
        <span
          onClickCapture={() => {
            try {
              sessionStorage.setItem(pendingKey(token), "1");
            } catch {}
          }}
        >
          <SignInButton mode="modal">
            <button className={styles[variant]} aria-label={t("copyTrip.signInToUse")} title={t("copyTrip.signInToUse")}>
              {label}
            </button>
          </SignInButton>
        </span>
      </Unauthenticated>
      <Authenticated>
        {button}
        {/* Only the hero copy reopens after sign-in, so the dialog doesn't open twice. */}
        {variant === "hero" && <ResumeAfterSignIn token={token} onResume={() => setOpen(true)} />}
        <CopyDialog open={open} onClose={() => setOpen(false)} token={token} trip={trip} />
      </Authenticated>
    </>
  );
}

function ResumeAfterSignIn({ token, onResume }: { token: string; onResume: () => void }) {
  useEffect(() => {
    if (readPending(token)) onResume();
  }, [token, onResume]);
  return null;
}

function CopyDialog({ open, onClose, token, trip }: { open: boolean; onClose: () => void; token: string; trip: PublicTripDetails }) {
  const copyShared = useMutation(api.trips.copyShared);
  // A copy counts as planning a trip, so the plan's limits apply (checked again on the server).
  const plan = useQuery(api.billing.status, {});
  const router = useRouter();
  const { t, f } = useI18n();
  const [today] = useState(localToday);
  const [start, setStart] = useState(() => suggestedCopyStart(trip.startDate, today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const places = trip.subTrips.reduce((n, d) => n + d.activities.length, 0);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(start);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, busy, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return setError(t("errors.pickStartDate"));
    setBusy(true);
    setError(null);
    try {
      const tripId = await copyShared({ token, startDate: start });
      router.push(`/trips/${tripId}`);
    } catch (err) {
      setError((err instanceof Error && err.message.match(/Uncaught Error: (.*?)(\n|$)/)?.[1]) || t("copyTrip.failed"));
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
        >
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-labelledby="use-trip-title"
            onSubmit={(e) => void submit(e)}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl"
          >
            <h2 id="use-trip-title" className="text-2xl font-extrabold tracking-tight">
              {t("copyTrip.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("copyTrip.body")}</p>

            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-muted px-3 py-1">📍 {trip.destination}</span>
              <span className="rounded-full bg-muted px-3 py-1">🗓️ {t("copyTrip.days", { count: trip.subTrips.length })}</span>
              <span className="rounded-full bg-muted px-3 py-1">📌 {t("copyTrip.places", { count: places })}</span>
            </div>

            <label className="mt-5 block text-sm font-semibold" htmlFor="use-trip-start">
              {t("copyTrip.startLabel")}
            </label>
            <input
              id="use-trip-start"
              type="date"
              required
              min={today}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base"
            />
            {valid && <p className="mt-1.5 text-sm text-muted-foreground">{t("copyTrip.endsOn", { date: f.longDay(copyEnd(trip, start)) })}</p>}

            <ul className="mt-5 flex flex-col gap-1.5 text-sm text-muted-foreground">
              <li>✅ {t("copyTrip.comesAlong")}</li>
              <li>🧹 {t("copyTrip.staysBehind")}</li>
            </ul>

            {plan?.blocked && (
              <p className="mt-4 text-sm font-medium text-muted-foreground">
                {t(plan.blocked === "subscribe" ? "errors.subscribeForMore" : "errors.tooManyUpcoming", { max: plan.maxUpcoming })}
              </p>
            )}
            {error && !plan?.blocked && <p className="mt-4 text-sm font-medium text-danger">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={busy} className="rounded-full px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
                {t("common.cancel")}
              </button>
              {plan?.blocked === "subscribe" ? (
                <Link href="/pricing" className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:opacity-90">
                  {t("billing.subscribe", { price: TRAVELER_PRICE })}
                </Link>
              ) : (
              <button
                type="submit"
                disabled={busy || !valid || Boolean(plan?.blocked)}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? t("copyTrip.copying") : t("copyTrip.copy")}
              </button>
              )}
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
