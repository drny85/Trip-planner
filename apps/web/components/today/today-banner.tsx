"use client";

import { useI18n } from "@trip/i18n/react";
import { localToday } from "@trip/ui";
import { motion } from "motion/react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { rise } from "@/lib/motion";

const noop = () => () => {};

/** On a travel day, a banner into today mode; before the trip, a quiet link to preview it. */
export function TodayBanner({ trip }: { trip: { _id: string; startDate: string; endDate: string } }) {
  const today = useSyncExternalStore(noop, localToday, () => null);
  const { t } = useI18n();
  if (!today) return null;
  const live = today >= trip.startDate && today <= trip.endDate;
  if (!live) {
    return (
      <div className="mt-4 flex justify-end">
        <Link href={`/trips/${trip._id}/today?day=1`} className="text-sm font-semibold text-muted-foreground transition hover:text-primary">
          ☀️ {t("today.bannerPreview")} →
        </Link>
      </div>
    );
  }
  return (
    <motion.div {...rise(0)}>
      <Link
        href={`/trips/${trip._id}/today`}
        className="mt-6 flex items-center gap-4 rounded-3xl bg-gradient-to-r from-primary to-emerald-500 p-5 text-primary-foreground shadow-lg shadow-primary/25 transition hover:opacity-95 active:scale-[0.99]"
      >
        <span className="text-3xl" aria-hidden>
          ☀️
        </span>
        <span className="flex-1">
          <span className="block font-bold">{t("today.bannerTitle")}</span>
          <span className="block text-sm opacity-85">{t("today.bannerBody")}</span>
        </span>
        <span className="text-xl" aria-hidden>
          →
        </span>
      </Link>
    </motion.div>
  );
}
