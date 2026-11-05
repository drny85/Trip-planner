"use client";

import { api } from "@trip/backend/api";
import { formatDateRange } from "@trip/ui";
import { useQuery } from "convex/react";
import { motion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { SmartImage } from "@/components/smart-image";
import { TripSkeleton } from "@/components/trip/trip-view";
import { rise } from "@/lib/motion";
import { StoryView } from "./story-view";

const list = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** Public story page: a photo hero, the story, and an invite to plan your own trip. */
export function PublicStory({ token }: { token: string }) {
  const data = useQuery(api.journal.publicStory, { token });
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 120]);

  if (data === undefined) return <TripSkeleton />;
  if (data === null)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
        <span className="text-5xl">📖</span>
        <h1 className="text-2xl font-bold">This story isn&apos;t published</h1>
        <p className="text-muted-foreground">The organizer may have taken it down or stopped sharing the trip.</p>
        <Link href="/trips/new" className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground">
          ✨ Plan your own trip
        </Link>
      </div>
    );

  const { trip, story, travelers } = data;
  const cover = story.chapters.flatMap((c) => c.photos)[0]?.url ?? trip.imageUrl;
  return (
    <main className="pb-24">
      <section className="relative h-[28rem] w-full overflow-hidden sm:h-[34rem]">
        <motion.div style={{ y }} className="absolute inset-0">
          <SmartImage src={cover} seed={trip.destination} emoji="📖" priority className="h-full w-full" imgClassName="animate-kenburns" />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl px-4 pb-14 text-white">
          <motion.p {...rise(0)} className="text-sm font-semibold uppercase tracking-widest text-white/80">
            📍 {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
          </motion.p>
          <motion.h1 {...rise(1)} className="mt-2 text-balance text-4xl font-extrabold tracking-tight drop-shadow-sm sm:text-6xl">
            {story.title}
          </motion.h1>
          {travelers.length > 0 && (
            <motion.p {...rise(2)} className="mt-3 text-lg text-white/90">
              by {list(travelers)}
            </motion.p>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 pt-12">
        <StoryView story={story} showTitle={false} />

        <motion.div {...rise(0)} className="mt-16 flex flex-col items-center gap-3 rounded-3xl border border-primary/20 bg-primary/5 p-8 text-center">
          <p className="text-xl font-bold">Dreaming of {trip.destination}?</p>
          <p className="max-w-md text-muted-foreground">Plan a trip like this in seconds with AI, then write your own story when you&apos;re back.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link href="/trips/new" className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.97]">
              ✨ Plan your own trip
            </Link>
            <Link href={`/share/${token}`} className="rounded-full border border-border bg-card px-5 py-2.5 font-semibold hover:bg-muted">
              See the itinerary
            </Link>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
