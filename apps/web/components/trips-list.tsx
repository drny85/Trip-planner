"use client";

import { api } from "@trip/backend/api";
import { formatDateRange } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TripsList() {
  const trips = useQuery(api.trips.list);

  if (trips === undefined) return <p className="text-muted-foreground">Loading trips…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">My trips</h1>
        {trips.length > 0 && <DemoButton variant="link" />}
      </div>
      {trips.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border bg-card p-12 text-center">
          <h2 className="text-2xl font-bold">No trips yet</h2>
          <p className="max-w-md text-muted-foreground">
            Describe a trip and AI will build the whole itinerary, or load the sample Tokyo trip to look around.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/trips/new" className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90">
              ✨ Plan with AI
            </Link>
            <DemoButton variant="button" />
          </div>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <li key={trip._id}>
              <Link
                href={`/trips/${trip._id}`}
                className="group block overflow-hidden rounded-3xl border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative h-44">
                  <Image src={trip.imageUrl} alt="" fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover" />
                  {trip.isAIGenerated && (
                    <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-xs font-semibold text-white">
                      ✨ AI
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="truncate text-lg font-bold group-hover:text-primary">{trip.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
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
          ? "rounded-full bg-muted px-5 py-2.5 font-semibold hover:bg-border disabled:opacity-50"
          : "text-sm font-semibold text-primary hover:underline disabled:opacity-50"
      }
    >
      {loading ? "Loading…" : "Load demo trip"}
    </button>
  );
}
