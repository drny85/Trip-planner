"use client";

import { api } from "@trip/backend/api";
import { optimisticMove, optimisticRemove, optimisticSetCompleted } from "@trip/backend/optimistic";
import type { Activity, TripDetails } from "@trip/backend/types";
import { cn, links } from "@trip/ui";
import { useMutation } from "convex/react";
import Image from "next/image";
import { useState } from "react";
import { ActivityEditor } from "./activity-editor";

type Props = {
  activity: Activity;
  trip: TripDetails;
  index: number;
  count: number;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
};

export function ActivityItem({ activity, trip, index, count, isDragging, onDragStart, onDragEnd }: Props) {
  const setCompleted = useMutation(api.activities.setCompleted).withOptimisticUpdate(optimisticSetCompleted);
  const move = useMutation(api.activities.move).withOptimisticUpdate(optimisticMove);
  const remove = useMutation(api.activities.remove).withOptimisticUpdate(optimisticRemove);
  const [editing, setEditing] = useState(false);
  const done = activity.isCompleted;

  return (
    <article
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative rounded-2xl border border-border bg-card transition",
        !editing && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      {/* Timeline dot doubles as the completion checkbox */}
      <button
        role="checkbox"
        aria-checked={done}
        aria-label={`Mark ${activity.title} as ${done ? "not done" : "done"}`}
        onClick={() => void setCompleted({ activityId: activity._id, isCompleted: !done })}
        className={cn(
          "absolute -left-[3.05rem] top-5 grid h-7 w-7 place-items-center rounded-full border-2 text-sm font-bold transition",
          done ? "border-success bg-success text-card" : "border-border bg-card hover:border-primary",
        )}
      >
        {done ? "✓" : ""}
      </button>

      {editing ? (
        <ActivityEditor activity={activity} onDone={() => setEditing(false)} />
      ) : (
        <div className={cn("flex flex-col gap-4 p-4 sm:flex-row", done && "opacity-60")}>
          <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-36">
            <Image src={activity.photoUrl} alt="" fill sizes="144px" className="object-cover" draggable={false} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {activity.startTime && (
              <p className="text-xs font-medium text-muted-foreground">
                🕒 {activity.startTime}
                {activity.durationMinutes ? ` · ${formatDuration(activity.durationMinutes)}` : ""}
              </p>
            )}
            <h3 className={cn("text-lg font-bold", done && "line-through")}>{activity.title}</h3>
            <p className="text-sm text-muted-foreground">{activity.description}</p>
            <p className="truncate text-xs text-muted-foreground">📍 {activity.address}</p>

            <div className="mt-2 flex flex-wrap gap-2">
              {activity.phone && (
                <a href={links.phone(activity.phone)} className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold hover:bg-border">
                  📞 Call
                </a>
              )}
              <a
                href={links.directions(activity)}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold hover:bg-border"
              >
                🧭 Directions
              </a>
              {activity.bookingUrl ? (
                <a
                  href={activity.bookingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  🎟 Reserve
                </a>
              ) : activity.websiteUrl ? (
                <a
                  href={activity.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold hover:bg-border"
                >
                  🌐 Website
                </a>
              ) : null}
            </div>
          </div>

          {/* Edit / reorder controls (keyboard-friendly alternative to drag and drop) */}
          <div className="flex shrink-0 gap-1 sm:absolute sm:right-3 sm:top-3 sm:rounded-xl sm:bg-card sm:p-1 sm:opacity-0 sm:shadow-sm sm:transition sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            <IconButton label="Edit" onClick={() => setEditing(true)}>✎</IconButton>
            <IconButton
              label="Move earlier"
              disabled={index === 0}
              onClick={() => void move({ activityId: activity._id, toSubTripId: activity.subTripId, toIndex: index - 1 })}
            >
              ↑
            </IconButton>
            <IconButton
              label="Move later"
              disabled={index >= count - 1}
              onClick={() => void move({ activityId: activity._id, toSubTripId: activity.subTripId, toIndex: index + 1 })}
            >
              ↓
            </IconButton>
            <select
              aria-label="Move to day"
              value={activity.subTripId}
              onChange={(e) => {
                const target = trip.subTrips.find((s) => s._id === e.target.value);
                if (target) void move({ activityId: activity._id, toSubTripId: target._id, toIndex: target.activities.length });
              }}
              className="h-8 rounded-lg border border-border bg-card px-1 text-xs"
            >
              {trip.subTrips.map((s) => (
                <option key={s._id} value={s._id}>
                  Day {s.dayNumber}
                </option>
              ))}
            </select>
            <IconButton
              label="Delete"
              onClick={() => {
                if (confirm(`Delete "${activity.title}"?`)) void remove({ activityId: activity._id });
              }}
            >
              🗑
            </IconButton>
          </div>
        </div>
      )}
    </article>
  );
}

function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-sm hover:bg-border disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}
