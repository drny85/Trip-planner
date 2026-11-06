"use client";

import { fileSlug } from "@trip/i18n/itinerary";
import { useI18n } from "@trip/i18n/react";
import { toICS } from "@trip/ui";

type Trip = Parameters<typeof toICS>[0];

/** Downloads the itinerary as an .ics file for Apple, Google or Outlook calendars. */
export function CalendarButton({ trip }: { trip: Trip }) {
  const { t } = useI18n();
  const download = () => {
    const blob = new Blob([toICS(trip)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `${fileSlug(trip.title)}.ics` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <button
      onClick={download}
      className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/25 active:scale-[0.97]"
    >
      📅 {t("trip.addToCalendar")}
    </button>
  );
}
