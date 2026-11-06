"use client";

import { itineraryHtml } from "@trip/i18n/itinerary";
import { useI18n } from "@trip/i18n/react";

type Trip = Parameters<typeof itineraryHtml>[0];

/**
 * Opens the browser's print dialog on a clean, printable itinerary, where
 * "Save as PDF" makes the file. It prints from a hidden frame, so no pop-up.
 */
export function PdfButton({ trip }: { trip: Trip }) {
  const i18n = useI18n();
  const print = () => {
    document.getElementById("itinerary-print")?.remove();
    const frame = Object.assign(document.createElement("iframe"), { id: "itinerary-print", title: i18n.t("print.button") });
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    };
    frame.srcdoc = itineraryHtml(trip, i18n);
    document.body.appendChild(frame);
  };
  return (
    <button
      onClick={print}
      className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/25 active:scale-[0.97]"
    >
      🖨 {i18n.t("print.button")}
    </button>
  );
}
