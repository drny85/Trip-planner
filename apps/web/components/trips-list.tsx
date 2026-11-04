"use client";

import { api } from "@trip/backend/api";
import { formatDateRange, tripLength } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { rise } from "@/lib/motion";
import { SmartImage } from "./smart-image";

export function TripsList() {
  const trips = useQuery(api.trips.list);

  return (
    <div className="flex flex-col gap-8">
      <motion.div {...rise(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Your adventures</p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">My trips</h1>
        </div>
        {trips && trips.length > 0 && <DemoButton variant="link" />}
      </motion.div>

      {trips === undefined ? (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-80 animate-pulse rounded-3xl bg-muted" />
          ))}
        </ul>
      ) : trips.length === 0 ? (
        <motion.div
          {...rise(1)}
          className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border bg-card/60 p-12 text-center"
        >
          <motion.span
            animate={{ rotate: [0, -8, 8, 0], y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="text-5xl"
          >
            🧳
          </motion.span>
          <h2 className="text-2xl font-bold">No trips yet</h2>
          <p className="max-w-md text-muted-foreground">
            Describe a trip and AI builds the whole itinerary, or load the sample Tokyo trip to look around.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/trips/new"
              className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition active:scale-[0.97]"
            >
              ✨ Plan with AI
            </Link>
            <DemoButton variant="button" />
          </div>
        </motion.div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip, i) => (
            <motion.li key={trip._id} {...rise(i + 1)} layout>
              <Link
                href={`/trips/${trip._id}`}
                className="group relative block h-80 overflow-hidden rounded-3xl shadow-sm ring-1 ring-border transition-shadow duration-300 hover:shadow-2xl"
              >
                <SmartImage
                  src={trip.imageUrl}
                  seed={trip.destination}
                  emoji="🌍"
                  className="absolute inset-0"
                  imgClassName="transition-transform duration-700 ease-out group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
                  <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
                    {tripLength(trip.startDate, trip.endDate)} days
                  </span>
                  {trip.isAIGenerated && (
                    <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">✨ AI</span>
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <p className="text-sm text-white/80">{formatDateRange(trip.startDate, trip.endDate)}</p>
                  <h2 className="mt-0.5 truncate text-2xl font-bold">{trip.title}</h2>
                  <p className="flex items-center justify-between text-sm text-white/85">
                    <span className="truncate">📍 {trip.destination}</span>
                    <span className="translate-x-[-6px] opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100">→</span>
                  </p>
                </div>
              </Link>
            </motion.li>
          ))}
          <motion.li {...rise(trips.length + 1)}>
            <Link
              href="/trips/new"
              className="group grid h-80 place-items-center rounded-3xl border-2 border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <span className="flex flex-col items-center gap-2 font-semibold">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-2xl transition-transform group-hover:rotate-90">+</span>
                Plan a new trip
              </span>
            </Link>
          </motion.li>
        </ul>
      )}
    </div>
  );
}

function DemoButton({ variant }: { variant: "button" | "link" }) {
  const seed = useMutation(api.seed.demoTrip);
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const tripId = await seed();
      router.push(`/trips/${tripId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={load}
      disabled={loading}
      className={
        variant === "button"
          ? "rounded-full border border-border bg-card px-5 py-2.5 font-semibold transition hover:bg-muted active:scale-[0.97] disabled:opacity-50"
          : "text-sm font-semibold text-primary hover:underline disabled:opacity-50"
      }
    >
      {loading ? "Loading…" : "Load demo trip"}
    </button>
  );
}
