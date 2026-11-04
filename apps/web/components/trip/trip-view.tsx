"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticMove } from "@trip/backend/optimistic";
import type { TripDetails } from "@trip/backend/types";
import { cn, formatDateRange, formatDay } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActivityItem } from "./activity-item";

export function TripView({ tripId }: { tripId: Id<"trips"> }) {
  const trip = useQuery(api.trips.get, { tripId });
  if (trip === undefined) return <p className="p-8 text-center text-muted-foreground">Loading trip…</p>;
  if (trip === null) return <p className="p-8 text-center text-muted-foreground">This trip doesn&apos;t exist anymore.</p>;
  return <Itinerary trip={trip} />;
}

type DragState = { activityId: Id<"activities"> } | null;

function Itinerary({ trip }: { trip: TripDetails }) {
  const move = useMutation(api.activities.move).withOptimisticUpdate(optimisticMove);
  const [dragging, setDragging] = useState<DragState>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const { completed, total } = trip.progress;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  const drop = (toSubTripId: Id<"subTrips">, toIndex: number) => {
    if (dragging) void move({ activityId: dragging.activityId, toSubTripId, toIndex });
    setDragging(null);
    setDropTarget(null);
  };

  return (
    <main className="pb-20">
      <section className="relative h-80 w-full overflow-hidden sm:h-96">
        <Image src={trip.imageUrl} alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-4xl px-4 pb-14 text-white">
          {trip.isAIGenerated && (
            <span className="mb-2 inline-block rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">✨ AI generated</span>
          )}
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{trip.title}</h1>
          <p className="mt-1 text-white/90">
            {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4">
        <div className="relative -mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">Trip progress</span>
            <span className="text-sm text-muted-foreground">
              {completed} of {total} done
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          {trip.description && <p className="mt-3 text-muted-foreground">{trip.description}</p>}
          <p className="mt-3 text-xs text-muted-foreground">Tip: drag activities to reorder them or move them to another day.</p>
        </div>

        {trip.subTrips.map((subTrip) => (
          <section key={subTrip._id} className="mt-10">
            <header className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary font-bold text-primary-foreground">
                {subTrip.dayNumber}
              </span>
              <div>
                <h2 className="text-xl font-bold">{subTrip.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {[subTrip.date && formatDay(subTrip.date), subTrip.location].filter(Boolean).join(" · ")}
                </p>
              </div>
            </header>

            <ol className="relative ml-5 border-l-2 border-border pl-8">
              {subTrip.activities.map((activity, index) => (
                <li
                  key={activity._id}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    setDropTarget(activity._id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    drop(subTrip._id, index);
                  }}
                  className={cn(
                    "relative pb-5",
                    dropTarget === activity._id && dragging?.activityId !== activity._id && "before:absolute before:-top-2 before:left-0 before:right-0 before:h-1 before:rounded-full before:bg-primary",
                  )}
                >
                  <ActivityItem
                    activity={activity}
                    trip={trip}
                    index={index}
                    count={subTrip.activities.length}
                    isDragging={dragging?.activityId === activity._id}
                    onDragStart={() => setDragging({ activityId: activity._id })}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                  />
                </li>
              ))}
              {/* Drop zone at the end of the day (also lets you drop into an empty day) */}
              <li
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setDropTarget(`end-${subTrip._id}`);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(subTrip._id, subTrip.activities.length);
                }}
                className={cn(
                  "rounded-xl border-2 border-dashed border-transparent py-3 text-center text-sm text-muted-foreground",
                  dragging && "border-border",
                  dropTarget === `end-${subTrip._id}` && "border-primary text-primary",
                )}
              >
                {dragging ? "Drop here" : subTrip.activities.length === 0 ? "Nothing planned for this day yet." : null}
              </li>
            </ol>
          </section>
        ))}

        <DeleteTrip tripId={trip._id} title={trip.title} />
      </div>
    </main>
  );
}

function DeleteTrip({ tripId, title }: { tripId: Id<"trips">; title: string }) {
  const remove = useMutation(api.trips.remove);
  const router = useRouter();
  return (
    <div className="mt-12 flex justify-center">
      <button
        onClick={async () => {
          if (!confirm(`Delete "${title}"? This removes every day and activity in the trip.`)) return;
          router.push("/trips");
          await remove({ tripId });
        }}
        className="rounded-full bg-danger/10 px-5 py-2.5 text-sm font-semibold text-danger hover:bg-danger/20"
      >
        Delete trip
      </button>
    </div>
  );
}
