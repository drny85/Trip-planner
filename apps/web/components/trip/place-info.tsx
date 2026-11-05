"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn, links } from "@trip/ui";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";

type Details = NonNullable<FunctionReturnType<typeof api.places.details>>;
type I18n = ReturnType<typeof useI18n>;

/** Rating, price, open now, hours, phone and website from Google Maps. Loaded live when shown. */
export function PlaceInfo({ activityId }: { activityId: Id<"activities"> }) {
  const load = useAction(api.places.details);
  const [details, setDetails] = useState<Details | null | undefined>(undefined);
  const { t, f } = useI18n();
  useEffect(() => {
    let live = true;
    load({ activityId })
      .then((d) => live && setDetails(d))
      .catch(() => live && setDetails(null));
    return () => {
      live = false;
    };
  }, [activityId, load]);

  if (details === undefined) return <div className="h-16 animate-pulse rounded-2xl bg-muted" aria-busy />;
  if (details === null) return null;

  const status = statusLine(details, t, f);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background/60 p-4 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {details.rating !== undefined && (
          <span className="font-bold">
            <span className="text-amber-500" aria-hidden>
              {stars(details.rating)}
            </span>{" "}
            {f.number(details.rating)}
            {details.ratingCount ? <span className="font-normal text-muted-foreground"> · {t("place.reviews", { count: details.ratingCount })}</span> : null}
          </span>
        )}
        {details.priceLevel ? <span className="font-semibold text-muted-foreground">{"$".repeat(details.priceLevel)}</span> : null}
        {status && <span className={cn("font-semibold", status.tone === "good" ? "text-success" : "text-danger")}>{status.text}</span>}
      </div>
      {details.summary && <p className="text-muted-foreground">{details.summary}</p>}
      {details.weekHours?.length ? (
        <details>
          <summary className="cursor-pointer font-semibold">{t("place.hours")}</summary>
          <ul className="mt-1 text-muted-foreground">
            {details.weekHours.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {details.phone && (
          <a href={links.phone(details.phone)} className="rounded-full bg-muted px-3 py-1 font-semibold hover:bg-border">
            📞 {details.phone}
          </a>
        )}
        {details.website && (
          <a href={details.website} target="_blank" rel="noreferrer" className="rounded-full bg-muted px-3 py-1 font-semibold hover:bg-border">
            🌐 {t("activity.website")}
          </a>
        )}
        {details.mapsUrl && (
          <a href={details.mapsUrl} target="_blank" rel="noreferrer" className="rounded-full bg-muted px-3 py-1 font-semibold hover:bg-border">
            📍 {t("place.openInMaps")}
          </a>
        )}
      </div>
    </div>
  );
}

/** "★★★★☆" for 4.3: full stars, rounded to the nearest whole. */
const stars = (rating: number) => {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
};

function statusLine(d: Details, t: I18n["t"], f: I18n["f"]): { text: string; tone: "good" | "bad" } | null {
  if (d.status === "closedPermanently") return { text: t("place.closedPermanently"), tone: "bad" };
  if (d.status === "closedTemporarily") return { text: t("place.closedTemporarily"), tone: "bad" };
  if (d.openNow === undefined) return null;
  const next = d.nextChange ? f.time(d.nextChange) : undefined;
  if (d.openNow) return { text: next ? `${t("place.openNow")} · ${t("place.closesAt", { time: next })}` : t("place.openNow"), tone: "good" };
  return { text: next ? `${t("place.closedNow")} · ${t("place.opensAt", { time: next })}` : t("place.closedNow"), tone: "bad" };
}
