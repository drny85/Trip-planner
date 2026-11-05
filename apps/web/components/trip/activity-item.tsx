"use client";

import { api } from "@trip/backend/api";
import { optimisticMove, optimisticRemove } from "@trip/backend/optimistic";
import type { Activity, PublicTripDetails } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { cn, getCategory, googlePhotoCredit, links } from "@trip/ui";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { PlaceInfo } from "./place-info";
import { SmartImage } from "@/components/smart-image";
import { EASE_OUT } from "@/lib/motion";
import { ActivityEditor } from "./activity-editor";
import { ActivityNotes } from "./journal";
import { BookingChip } from "./bookings";
import { ActivityPhotos } from "./memories";
import { SubActivities } from "./sub-activities";
import { useToggleDone } from "@/components/undo-toast";

type Props = {
  activity: Activity;
  trip: PublicTripDetails;
  readOnly?: boolean;
  /** Members can check things off without editing the itinerary. */
  canCheck?: boolean;
  index: number;
  count: number;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
};

export function ActivityItem({ activity, trip, index, count, isDragging, onDragStart, onDragEnd, readOnly = false, canCheck = !readOnly }: Props) {
  const toggleDone = useToggleDone();
  const move = useMutation(api.activities.move).withOptimisticUpdate(optimisticMove);
  const remove = useMutation(api.activities.remove).withOptimisticUpdate(optimisticRemove);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showPlace, setShowPlace] = useState(false);
  const done = activity.isCompleted;
  const category = getCategory(activity.category);
  const { t, f, category: categoryText } = useI18n();
  const credit = googlePhotoCredit(activity);
  const badge = categoryText(activity.category, activity.subcategory);

  return (
    <>
      {/* Timeline dot doubles as the completion checkbox */}
      <motion.button
        role="checkbox"
        aria-checked={done}
        aria-label={t(done ? "activity.markNotDone" : "activity.markDone", { title: activity.title })}
        onClick={() => void toggleDone(activity, !done)}
        disabled={!canCheck}
        whileTap={canCheck ? { scale: 0.85 } : undefined}
        className={cn(
          "absolute -left-[3.15rem] top-5 z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-sm font-bold shadow-sm transition-colors duration-200",
          done ? "border-success bg-success text-card" : "border-border bg-card",
          canCheck && !done && "hover:border-primary",
        )}
      >
        <AnimatePresence initial={false}>
          {done && (
            <motion.span
              key="check"
              initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.5 }}
            >
              ✓
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {done && (
            <motion.span
              key="ring"
              className="absolute inset-0 rounded-full border-2 border-success"
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 1.9, opacity: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            />
          )}
        </AnimatePresence>
      </motion.button>

      <article
        draggable={!editing && !readOnly}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group relative overflow-hidden rounded-3xl border border-border/80 bg-card shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/5",
          !editing && !readOnly && "cursor-grab active:cursor-grabbing",
          isDragging && "scale-[0.98] opacity-40",
        )}
      >
        {editing ? (
          <ActivityEditor activity={activity} onDone={() => setEditing(false)} />
        ) : (
          <>
          <div className="flex flex-col sm:flex-row">
            <div className="relative h-44 w-full shrink-0 sm:h-auto sm:min-h-44 sm:w-48">
              <SmartImage
                src={activity.photoUrl}
                seed={activity.title}
                emoji={category.emoji}
                tint={category.color}
                className="absolute inset-0"
                imgClassName={cn("transition duration-500 group-hover:scale-105", done && "grayscale")}
              />
              {credit !== null && (
                <span className="absolute bottom-1.5 right-2 max-w-[90%] truncate rounded bg-black/45 px-1.5 py-0.5 text-[10px] text-white/90">
                  {credit ? t("activity.photoBy", { name: credit }) : "Google Maps"}
                </span>
              )}
              <span
                className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-md"
                style={{ backgroundColor: `${category.color}cc` }}
              >
                {badge.emoji} {badge.text}
              </span>
              <AnimatePresence>
                {done && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 grid place-items-center bg-black/35"
                  >
                    <motion.span
                      initial={{ scale: 0.6 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", duration: 0.4, bounce: 0.45 }}
                      className="rounded-full bg-success px-3 py-1 text-sm font-bold text-white shadow-lg"
                    >
                      ✓ {t("activity.done")}
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5 p-5 transition-opacity", done && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                {activity.startTime && <span className="rounded-md bg-muted px-2 py-0.5 tabular-nums text-foreground">{f.time(activity.startTime)}</span>}
                {activity.durationMinutes ? <span>⏱ {f.duration(activity.durationMinutes)}</span> : null}
                <BookingChip activityId={activity._id} />
              </div>
              <h3 className={cn("text-lg font-bold leading-snug decoration-2 transition", done && "line-through")}>{activity.title}</h3>
              <p className="line-clamp-2 text-sm text-muted-foreground">{activity.description}</p>
              <p className="truncate text-xs text-muted-foreground">📍 {activity.address}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {activity.phone && <Pill href={links.phone(activity.phone)}>📞 {t("activity.call")}</Pill>}
                <Pill href={links.directions(activity)} external>
                  🧭 {t("activity.directions")}
                </Pill>
                {activity.bookingUrl ? (
                  <Pill href={activity.bookingUrl} external primary>
                    🎟 {t("activity.reserve")}
                  </Pill>
                ) : activity.websiteUrl ? (
                  <Pill href={activity.websiteUrl} external>
                    🌐 {t("activity.website")}
                  </Pill>
                ) : null}
                {/* Live Google details (rating, hours, phone). Needs sign-in, so not on share links. */}
                {!readOnly && activity.category !== "transport" && (
                  <button
                    type="button"
                    aria-expanded={showPlace}
                    onClick={() => setShowPlace((v) => !v)}
                    className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition active:scale-[0.96]", showPlace ? "bg-foreground text-background" : "bg-muted hover:bg-border")}
                  >
                    ★ {t("place.heading")}
                  </button>
                )}
              </div>
              {showPlace && (
                <div className="mt-2">
                  <PlaceInfo activityId={activity._id} />
                </div>
              )}
              <div className="mt-2">
                <ActivityPhotos activityId={activity._id} />
              </div>
            </div>

            {/* Edit / reorder controls (keyboard-friendly alternative to drag and drop) */}
            {!readOnly && <div className="flex shrink-0 gap-1 px-5 pb-4 sm:absolute sm:right-3 sm:top-3 sm:translate-y-1 sm:rounded-2xl sm:border sm:border-border sm:bg-card/95 sm:p-1 sm:opacity-0 sm:shadow-lg sm:backdrop-blur sm:transition sm:duration-200 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:focus-within:translate-y-0 sm:focus-within:opacity-100">
              <IconButton label={t("activity.edit")} onClick={() => setEditing(true)}>
                ✎
              </IconButton>
              <IconButton label={t("activity.addStep")} onClick={() => setAdding(true)}>
                ＋
              </IconButton>
              <IconButton
                label={t("activity.moveEarlier")}
                disabled={index === 0}
                onClick={() => void move({ activityId: activity._id, toSubTripId: activity.subTripId, toIndex: index - 1 })}
              >
                ↑
              </IconButton>
              <IconButton
                label={t("activity.moveLater")}
                disabled={index >= count - 1}
                onClick={() => void move({ activityId: activity._id, toSubTripId: activity.subTripId, toIndex: index + 1 })}
              >
                ↓
              </IconButton>
              <select
                aria-label={t("activity.moveToDay")}
                value={activity.subTripId}
                onChange={(e) => {
                  const target = trip.subTrips.find((s) => s._id === e.target.value);
                  if (target) void move({ activityId: activity._id, toSubTripId: target._id, toIndex: target.activities.length });
                }}
                className="h-8 rounded-xl border border-border bg-card px-1 text-xs"
              >
                {trip.subTrips.map((s) => (
                  <option key={s._id} value={s._id}>
                    {t("time.dayN", { day: s.dayNumber })}
                  </option>
                ))}
              </select>
              <IconButton
                label={t("activity.delete")}
                onClick={() => {
                  if (confirm(t("activity.deleteConfirm", { title: activity.title }))) void remove({ activityId: activity._id });
                }}
              >
                🗑
              </IconButton>
            </div>}
          </div>
          {/* Outside the faded body, so notes on a done activity stay readable */}
          <ActivityNotes activityId={activity._id} isCompleted={done} className="px-5 pb-5" />
          </>
        )}
      </article>

      <SubActivities parent={activity} readOnly={readOnly} canCheck={canCheck} adding={adding} onAddDone={() => setAdding(false)} />
    </>
  );
}

function Pill({ href, external, primary, children }: { href: string; external?: boolean; primary?: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      draggable={false}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-sm font-semibold transition active:scale-[0.96]",
        primary ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:opacity-90" : "bg-muted hover:bg-border",
      )}
    >
      {children}
    </a>
  );
}

function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-xl text-sm transition hover:bg-muted active:scale-90 disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}
