"use client";

import type { Activity } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { links } from "@trip/ui";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { EASE_OUT } from "@/lib/motion";
import type { Stop } from "./day-map-leaflet";

// Leaflet touches `window`, so it only loads in the browser.
const DayMapLeaflet = dynamic(() => import("./day-map-leaflet"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
});

export function hasCoords(a: Activity): a is Activity & { latitude: number; longitude: number } {
  return a.latitude != null && a.longitude != null;
}

/** "Map" toggle for a day: an OpenStreetMap of the stops in order, plus a link to the full route. */
export function DayMap({ activities }: { activities: Activity[] }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const stops: Stop[] = activities.filter(hasCoords);
  if (stops.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-muted active:scale-[0.97]"
        >
          🗺 {open ? t("map.hide") : t("map.show")}
        </button>
        <a
          href={links.route(activities)}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-muted active:scale-[0.97]"
        >
          🧭 {t("map.route")}
        </a>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="mt-3 h-72 overflow-hidden rounded-3xl border border-border shadow-sm sm:h-80">
              <DayMapLeaflet stops={stops} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
