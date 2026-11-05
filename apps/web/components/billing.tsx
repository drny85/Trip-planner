"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { TRAVELER_PRICE } from "@trip/ui";
import { useAction, useQuery } from "convex/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { rise } from "@/lib/motion";

/** Asks Convex to re-read the subscription from Clerk (after checkout, or from "I've subscribed"). */
export function useRefreshSubscription() {
  const refresh = useAction(api.billing.refresh);
  const [busy, setBusy] = useState(false);
  return {
    busy,
    refresh: async () => {
      setBusy(true);
      try {
        await refresh({});
      } finally {
        setBusy(false);
      }
    },
  };
}

/** On a trip whose organizer hasn't subscribed: what's locked and how to unlock it. */
export function TripLockedBanner({ tripId }: { tripId: Id<"trips"> }) {
  const lock = useQuery(api.billing.tripLocked, { tripId });
  const { t } = useI18n();
  if (!lock?.locked) return null;
  return (
    <motion.div {...rise(0)} className="mt-6 flex flex-wrap items-center gap-4 rounded-3xl bg-gradient-to-r from-primary to-emerald-500 p-5 text-primary-foreground shadow-lg shadow-primary/25">
      <span className="text-3xl">🔒</span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold">{lock.isOwner ? t("billing.lockedTitle") : t("billing.lockedMember")}</p>
        {lock.isOwner && <p className="text-sm opacity-90">{t("billing.lockedBody")}</p>}
      </div>
      {lock.isOwner && (
        <Link href="/pricing" className="rounded-full bg-white px-5 py-2.5 font-semibold text-primary shadow-md active:scale-[0.97]">
          {t("billing.subscribe", { price: TRAVELER_PRICE })}
        </Link>
      )}
    </motion.div>
  );
}

/** Shown instead of the planner when the plan doesn't allow another trip right now. */
export function PlanLimitNotice({ blocked, max }: { blocked: "subscribe" | "tooManyUpcoming"; max: number }) {
  const { t } = useI18n();
  const subscribe = blocked === "subscribe";
  return (
    <motion.div {...rise(0)} className="flex flex-col items-center gap-4 rounded-3xl bg-card p-8 text-center shadow-sm">
      <span className="text-5xl">{subscribe ? "✨" : "🧳"}</span>
      <h1 className="text-3xl font-extrabold tracking-tight">{subscribe ? t("billing.freeTitle") : t("billing.fullTitle", { max })}</h1>
      <p className="max-w-md text-muted-foreground">{subscribe ? t("billing.freeBody", { max }) : t("billing.fullBody")}</p>
      {subscribe ? (
        <Link href="/pricing" className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.97]">
          {t("billing.subscribe", { price: TRAVELER_PRICE })}
        </Link>
      ) : (
        <Link href="/trips" className="rounded-full bg-muted px-6 py-3 font-semibold">
          {t("nav.myTrips")}
        </Link>
      )}
      {subscribe && <p className="text-xs text-muted-foreground">{t("billing.cancelAnytime")}</p>}
    </motion.div>
  );
}
