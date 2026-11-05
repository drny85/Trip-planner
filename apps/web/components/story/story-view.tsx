"use client";

import type { api } from "@trip/backend/api";
import { cn, formatDay, links } from "@trip/ui";
import type { FunctionReturnType } from "convex/server";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { EASE_OUT } from "@/lib/motion";
import { dayColor, type RouteDay } from "./day-colors";

export type StoryData = NonNullable<FunctionReturnType<typeof api.journal.publicStory>>["story"];

// Leaflet touches `window`, so it only loads in the browser.
const StoryMapLeaflet = dynamic(() => import("./story-map-leaflet"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
});

const hasCoords = <T extends { latitude?: number; longitude?: number }>(s: T): s is T & { latitude: number; longitude: number } =>
  s.latitude != null && s.longitude != null;

/** The trip's route across every day of the story, with a legend. */
export function StoryMap({ story }: { story: StoryData }) {
  const days: RouteDay[] = story.chapters.map((c) => ({ dayNumber: c.dayNumber, stops: c.route.filter(hasCoords) })).filter((d) => d.stops.length > 0);
  if (days.length === 0) return null;
  const all = story.chapters.flatMap((c) => c.route);
  return (
    <figure className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="h-80 sm:h-96">
        <StoryMapLeaflet days={days} />
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm">
        {days.map((d) => (
          <span key={d.dayNumber} className="flex items-center gap-1.5 font-semibold">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dayColor(d.dayNumber) }} />
            Day {d.dayNumber}
          </span>
        ))}
        {all.length > 1 && (
          <a href={links.route(all.slice(0, 10))} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-primary hover:underline">
            Open in Google Maps ↗
          </a>
        )}
      </figcaption>
    </figure>
  );
}

/** The story itself: title, intro, a map of the route, one chapter per day, and a closing line. */
export function StoryView({ story, showTitle = true }: { story: StoryData; showTitle?: boolean }) {
  return (
    <article className="space-y-10">
      {showTitle && <h2 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">{story.title}</h2>}
      {story.intro && <p className="text-pretty text-lg leading-relaxed text-muted-foreground">{story.intro}</p>}
      <StoryMap story={story} />
      {story.chapters.map((c, i) => (
        <motion.section
          key={c.subTripId}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: EASE_OUT, delay: i === 0 ? 0.05 : 0 }}
        >
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest" style={{ color: dayColor(c.dayNumber) }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dayColor(c.dayNumber) }} />
            Day {c.dayNumber}
            {c.date && <span className="normal-case tracking-normal text-muted-foreground">· {formatDay(c.date)}</span>}
            {c.location && <span className="normal-case tracking-normal text-muted-foreground">· {c.location}</span>}
          </p>
          <h3 className="mt-1 text-balance text-2xl font-bold tracking-tight">{c.heading}</h3>
          <div className="mt-3 space-y-3 text-pretty leading-relaxed">
            {c.body.split(/\n{2,}/).map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </div>
          {c.photos.length > 0 && (
            <ul className={c.photos.length === 1 ? "mt-5" : "mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3"}>
              {c.photos.map((p, j) => (
                <li key={p._id} className={c.photos.length > 2 && j === 0 ? "col-span-2 row-span-2" : undefined}>
                  <figure className="group relative h-full overflow-hidden rounded-2xl bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Convex storage URL */}
                    <img src={p.url} alt={p.caption ?? p.activityTitle} loading="lazy" className={cn("h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]", c.photos.length === 1 ? "aspect-[3/2]" : "max-h-[32rem]")} />
                    {(p.caption || p.activityTitle) && (
                      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-xs font-semibold text-white">{p.caption ?? p.activityTitle}</figcaption>
                    )}
                  </figure>
                </li>
              ))}
            </ul>
          )}
          {c.highlights.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {c.highlights.map((h) => (
                <li key={h} className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                  📍 {h}
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      ))}
      {story.closing && <p className="border-t border-border pt-8 text-center text-lg italic text-muted-foreground">{story.closing}</p>}
    </article>
  );
}
