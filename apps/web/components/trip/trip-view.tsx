"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticMove } from "@trip/backend/optimistic";
import type { PublicTripDetails, TripDetails } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { cn, dayTitle } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, LayoutGroup, motion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SmartImage } from "@/components/smart-image";
import { EASE_OUT, layoutSpring, rise } from "@/lib/motion";
import { ActivityItem } from "./activity-item";
import { BookingsProvider, Bookings } from "./bookings";
import { BudgetCard } from "./budget-card";
import { Crew, LeaveTrip } from "./crew";
import { CalendarButton } from "./calendar-button";
import { Ideas } from "./ideas";
import { MemoriesGallery, MemoriesProvider } from "./memories";
import { PackingList } from "./packing-list";
import { DayExtras } from "./replan-day";
import { SplitCosts } from "./split-costs";
import { DayMap } from "./day-map";
import { ShareButton } from "./share-button";
import { TodayBanner } from "@/components/today/today-banner";

export function TripView({ tripId }: { tripId: Id<"trips"> }) {
  const trip = useQuery(api.trips.get, { tripId });
  const { t } = useI18n();
  if (trip === undefined) return <TripSkeleton />;
  if (trip === null) return <p className="p-8 text-center text-muted-foreground">{t("trip.notFound")}</p>;
  return <Itinerary trip={trip} mode={trip.myRole} />;
}

/** Public, read-only view behind a share link. */
export function SharedTripView({ token }: { token: string }) {
  const trip = useQuery(api.trips.getShared, { token });
  const { t } = useI18n();
  if (trip === undefined) return <TripSkeleton />;
  if (trip === null)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
        <span className="text-5xl">🔒</span>
        <h1 className="text-2xl font-bold">{t("trip.linkInactiveTitle")}</h1>
        <p className="text-muted-foreground">{t("trip.linkInactiveBody")}</p>
        <Link href="/trips/new" className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground">
          ✨ {t("trip.planYourOwnTrip")}
        </Link>
      </div>
    );
  return <Itinerary trip={trip} mode="public" />;
}

export function TripSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-[26rem] bg-muted" />
      <div className="mx-auto -mt-10 h-28 max-w-4xl rounded-3xl bg-card shadow-sm" />
    </div>
  );
}

type DragState = { activityId: Id<"activities"> } | null;

/**
 * owner: edits everything. member (joined by invite): checks things off, suggests
 * and votes. public (share link): looks only.
 */
function Itinerary({ trip, mode }: { trip: PublicTripDetails | TripDetails; mode: "owner" | "member" | "public" }) {
  const readOnly = mode !== "owner";
  const canCheck = mode !== "public";
  const move = useMutation(api.activities.move).withOptimisticUpdate(optimisticMove);
  const [dragging, setDragging] = useState<DragState>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const activeDay = useActiveDay(trip.subTrips.map((s) => s._id));
  const { t, f } = useI18n();

  const drop = (toSubTripId: Id<"subTrips">, toIndex: number) => {
    if (dragging) void move({ activityId: dragging.activityId, toSubTripId, toIndex });
    setDragging(null);
    setDropTarget(null);
  };

  return (
    <MemoriesProvider tripId={trip._id} enabled={canCheck}>
    <BookingsProvider tripId={trip._id} enabled={canCheck}>
    <main className="pb-24">
      <Hero
        trip={trip}
        action={
          <div className="flex gap-2">
            <CalendarButton trip={trip} />
            {!readOnly && <ShareButton tripId={trip._id} shareToken={"shareToken" in trip ? trip.shareToken : undefined} />}
          </div>
        }
      />

      <div className="mx-auto max-w-4xl px-4">
        <Stats trip={trip} readOnly={readOnly} />
        {mode !== "public" && <TodayBanner trip={trip} />}
        <BudgetCard trip={trip} />
        {mode !== "public" && <Crew tripId={trip._id} />}
        {mode !== "public" && <Bookings tripId={trip._id} days={trip.subTrips} />}
        {mode === "public" && (
          <motion.div {...rise(0)} className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm">
              <span className="font-semibold">{t("trip.sharedTitle")}</span> <span className="text-muted-foreground">{t("trip.sharedBody")}</span>
            </p>
            <Link href="/trips/new" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.97]">
              ✨ {t("trip.planYourOwn")}
            </Link>
          </motion.div>
        )}

        {/* Sticky day tabs with a sliding pill on the day in view */}
        <nav className="sticky top-16 z-20 -mx-4 mt-8 overflow-x-auto bg-background/80 px-4 py-3 backdrop-blur-xl [scrollbar-width:none]">
          <ul className="flex gap-2">
            {trip.subTrips.map((s) => (
              <li key={s._id}>
                <a
                  href={`#day-${s._id}`}
                  className={cn(
                    "relative block whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                    activeDay === s._id ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {activeDay === s._id && (
                    <motion.span layoutId="day-pill" transition={layoutSpring} className="absolute inset-0 -z-10 rounded-full bg-primary shadow-md shadow-primary/30" />
                  )}
                  {t("time.dayN", { day: s.dayNumber })}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <LayoutGroup>
          {trip.subTrips.map((subTrip) => (
            <motion.section
              key={subTrip._id}
              id={`day-${subTrip._id}`}
              data-day={subTrip._id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="mt-10"
            >
              <header className="mb-5 flex items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground shadow-lg shadow-primary/25">
                  <span className="text-[10px] font-semibold uppercase leading-none tracking-wider opacity-80">{t("trip.day")}</span>
                  <span className="-mt-2 text-xl font-extrabold leading-none">{subTrip.dayNumber}</span>
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-bold tracking-tight">{dayTitle(subTrip.title)}</h2>
                  <p className="text-sm text-muted-foreground">
                    {[subTrip.date && f.weekday(subTrip.date), subTrip.location, t("trip.stops", { count: subTrip.activities.length })]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <DayExtras day={subTrip} canEdit={!readOnly} />
              </header>

              <DayMap activities={subTrip.activities} />

              <ol className="relative ml-7 border-l-2 border-dashed border-border pl-8">
                <AnimatePresence initial={false}>
                  {subTrip.activities.map((activity, index) => (
                    <motion.li
                      key={activity._id}
                      layout
                      layoutId={activity._id}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
                      transition={layoutSpring}
                      onDragOver={(e) => {
                        if (!dragging || readOnly) return;
                        e.preventDefault();
                        setDropTarget(activity._id);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        drop(subTrip._id, index);
                      }}
                      className="relative pb-6"
                    >
                      {dropTarget === activity._id && dragging?.activityId !== activity._id && (
                        <motion.span layoutId="drop-line" className="absolute -top-3 left-0 right-0 h-1 rounded-full bg-primary" />
                      )}
                      <ActivityItem
                        activity={activity}
                        trip={trip}
                        index={index}
                        count={subTrip.activities.length}
                        isDragging={dragging?.activityId === activity._id}
                        readOnly={readOnly}
                        canCheck={canCheck}
                        onDragStart={() => setDragging({ activityId: activity._id })}
                        onDragEnd={() => {
                          setDragging(null);
                          setDropTarget(null);
                        }}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
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
                    "rounded-2xl border-2 border-dashed border-transparent py-3 text-center text-sm text-muted-foreground transition-colors",
                    dragging && "border-border",
                    dropTarget === `end-${subTrip._id}` && "border-primary bg-primary/5 text-primary",
                  )}
                >
                  {dragging ? t("trip.dropHere") : subTrip.activities.length === 0 ? t("trip.nothingPlanned") : null}
                </li>
              </ol>
            </motion.section>
          ))}
        </LayoutGroup>

        <MemoriesGallery subTrips={trip.subTrips} />
        {mode !== "public" && <Ideas tripId={trip._id} subTrips={trip.subTrips} />}
        {mode !== "public" && <SplitCosts tripId={trip._id} />}
        {mode !== "public" && <PackingList tripId={trip._id} />}
        {mode === "owner" && <DeleteTrip tripId={trip._id} title={trip.title} />}
        {mode === "member" && <LeaveTrip tripId={trip._id} title={trip.title} />}
      </div>
    </main>
    </BookingsProvider>
    </MemoriesProvider>
  );
}

function Hero({ trip, action }: { trip: PublicTripDetails; action?: React.ReactNode }) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 120]);
  const fade = useTransform(scrollY, [0, 300], [1, 0]);
  const { t, f } = useI18n();

  return (
    <section className="relative h-[26rem] w-full overflow-hidden sm:h-[30rem]">
      <motion.div style={{ y }} className="absolute inset-0">
        <SmartImage
          src={trip.imageUrl}
          seed={trip.destination}
          emoji="🌍"
          priority
          className="h-full w-full"
          imgClassName="animate-kenburns"
        />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />
      {action && <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">{action}</div>}
      <motion.div style={{ opacity: fade }} className="absolute inset-x-0 bottom-0 mx-auto max-w-4xl px-4 pb-20 text-white">
        <motion.div {...rise(0)} className="mb-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">📍 {trip.destination}</span>
          {trip.isAIGenerated && <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">✨ {t("trip.aiGenerated")}</span>}
        </motion.div>
        <motion.h1 {...rise(1)} className="text-4xl font-extrabold tracking-tight drop-shadow-sm sm:text-6xl">
          {trip.title}
        </motion.h1>
        <motion.p {...rise(2)} className="mt-2 text-lg text-white/90">
          {f.dateRange(trip.startDate, trip.endDate)}
        </motion.p>
      </motion.div>
    </section>
  );
}

function Stats({ trip, readOnly }: { trip: PublicTripDetails; readOnly: boolean }) {
  const { completed, total } = trip.progress;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const { t } = useI18n();
  const stats = [
    { label: t("trip.statDays"), value: trip.subTrips.length },
    { label: t("trip.statActivities"), value: total },
    { label: t("trip.statDone"), value: `${percent}%` },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 }}
      className="relative -mt-12 rounded-3xl border border-border/70 bg-card/90 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6"
    >
      <div className="grid grid-cols-3 divide-x divide-border">
        {stats.map((s) => (
          <div key={s.label} className="px-2 text-center">
            <motion.p key={String(s.value)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-extrabold tabular-nums sm:text-3xl">
              {s.value}
            </motion.p>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.8, ease: EASE_OUT }}
        />
      </div>
      <p className="mt-2 text-right text-xs text-muted-foreground">
        {t("trip.doneOf", { done: completed, total })}
      </p>
      {trip.description && <p className="mt-3 text-muted-foreground">{trip.description}</p>}
      {!readOnly && <p className="mt-3 text-xs text-muted-foreground">{t("trip.dragTip")}</p>}
    </motion.div>
  );
}

/** Tracks which day section is in view, for the sticky tab pill. */
function useActiveDay(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join(",");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.getAttribute("data-day");
        if (id) setActive(id);
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    document.querySelectorAll("[data-day]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);
  return active;
}

function DeleteTrip({ tripId, title }: { tripId: Id<"trips">; title: string }) {
  const remove = useMutation(api.trips.remove);
  const router = useRouter();
  const { t } = useI18n();
  return (
    <div className="mt-14 flex justify-center">
      <button
        onClick={async () => {
          if (!confirm(t("trip.deleteConfirm", { title }))) return;
          router.push("/trips");
          await remove({ tripId });
        }}
        className="rounded-full bg-danger/10 px-5 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/20 active:scale-[0.97]"
      >
        {t("trip.deleteTrip")}
      </button>
    </div>
  );
}
