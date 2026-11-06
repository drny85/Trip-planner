"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticMove } from "@trip/backend/optimistic";
import type { PublicTripDetails, TripDetails } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { cn, dayTitle } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, LayoutGroup, animate, motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SmartImage } from "@/components/smart-image";
import { EASE_OUT, layoutSpring, rise, useParallax } from "@/lib/motion";
import { ScrollProgress } from "@/components/marketing/sections";
import { ActivityItem } from "./activity-item";
import { BookingsProvider, Bookings } from "./bookings";
import { BudgetCard } from "./budget-card";
import { Crew, LeaveTrip } from "./crew";
import { CalendarButton } from "./calendar-button";
import { Ideas } from "./ideas";
import { GroupVotes } from "./group-votes";
import { JournalProvider, TripStory } from "./journal";
import { MemoriesGallery, MemoriesProvider } from "./memories";
import { PackingList } from "./packing-list";
import { DayExtras } from "./replan-day";
import { SplitCosts } from "./split-costs";
import { DayMap } from "./day-map";
import { PdfButton } from "./pdf-button";
import { ShareButton } from "./share-button";
import { UseTripButton } from "./use-trip";
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
  return <Itinerary trip={trip} mode="public" storyToken={token} />;
}

/** On a shared itinerary: a link to the trip's story, once the organizer publishes it. */
function StoryBanner({ token }: { token: string }) {
  const story = useQuery(api.journal.publicStory, { token });
  const { t } = useI18n();
  if (!story) return null;
  return (
    <motion.div {...rise(0)}>
      <Link
        href={`/share/${token}/story`}
        className="group mt-6 flex items-center gap-4 rounded-3xl bg-gradient-to-r from-primary to-emerald-500 p-5 text-primary-foreground shadow-lg shadow-primary/25 transition active:scale-[0.99]"
      >
        <span className="text-3xl">📖</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-widest opacity-80">{t("journal.readStory")}</span>
          <span className="block truncate text-lg font-bold">{story.story.title}</span>
        </span>
        <span className="text-xl transition group-hover:translate-x-1">→</span>
      </Link>
    </motion.div>
  );
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
function Itinerary({ trip, mode, storyToken }: { trip: PublicTripDetails | TripDetails; mode: "owner" | "member" | "public"; storyToken?: string }) {
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
    <JournalProvider tripId={trip._id} enabled={canCheck}>
    <BookingsProvider tripId={trip._id} enabled={canCheck}>
    <main className="pb-24">
      <ScrollProgress />
      <Hero
        trip={trip}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            {mode === "public" && storyToken && <UseTripButton token={storyToken} trip={trip} variant="hero" />}
            <CalendarButton trip={trip} />
            <PdfButton trip={trip} />
            {!readOnly && <ShareButton tripId={trip._id} shareToken={"shareToken" in trip ? trip.shareToken : undefined} />}
          </div>
        }
      />

      <div className="mx-auto max-w-4xl px-4">
        <Stats trip={trip} readOnly={readOnly} />
        {mode !== "public" && <TodayBanner trip={trip} />}
        <BudgetCard trip={trip} />
        {mode !== "public" && <Crew tripId={trip._id} />}
        {storyToken && <StoryBanner token={storyToken} />}
        {mode !== "public" && <Bookings tripId={trip._id} days={trip.subTrips} />}
        {mode !== "public" && <GroupVotes tripId={trip._id} subTrips={trip.subTrips} />}
        {mode === "public" && (
          <motion.div {...rise(0)} className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm">
              <span className="font-semibold">{t("copyTrip.bannerTitle")}</span> <span className="text-muted-foreground">{t("copyTrip.bannerBody")}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/trips/new" className="rounded-full bg-muted px-4 py-2 text-sm font-semibold active:scale-[0.97]">
                ✨ {t("trip.planYourOwn")}
              </Link>
              {storyToken && <UseTripButton token={storyToken} trip={trip} variant="banner" />}
            </div>
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
            <DaySection key={subTrip._id} id={subTrip._id}>
              <header className="mb-5 flex items-center gap-4">
                <motion.div
                  initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
                  whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ type: "spring", bounce: 0.5, duration: 0.7 }}
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground shadow-lg shadow-primary/25"
                >
                  <span className="text-[10px] font-semibold uppercase leading-none tracking-wider opacity-80">{t("trip.day")}</span>
                  <span className="-mt-2 text-xl font-extrabold leading-none">{subTrip.dayNumber}</span>
                </motion.div>
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
                <TimelineFill />
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
                      <RevealOnScroll index={index}>
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
                      </RevealOnScroll>
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
            </DaySection>
          ))}
        </LayoutGroup>

        <MemoriesGallery subTrips={trip.subTrips} />
        {mode !== "public" && <TripStory tripId={trip._id} />}
        {mode !== "public" && <Ideas tripId={trip._id} subTrips={trip.subTrips} />}
        {mode !== "public" && <SplitCosts tripId={trip._id} />}
        {mode !== "public" && <PackingList tripId={trip._id} />}
        {mode === "owner" && <DeleteTrip tripId={trip._id} title={trip.title} />}
        {mode === "member" && <LeaveTrip tripId={trip._id} title={trip.title} />}
      </div>
    </main>
    </BookingsProvider>
    </JournalProvider>
    </MemoriesProvider>
  );
}

function Hero({ trip, action }: { trip: PublicTripDetails; action?: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // Layered parallax: the photo sinks and zooms, the title lifts away faster.
  const y = useParallax(scrollYProgress, 0, 160);
  const scale = useParallax(scrollYProgress, 1, 1.15);
  const titleY = useParallax(scrollYProgress, 0, -80);
  const fade = useTransform(scrollYProgress, [0, 0.6], [1, reduce ? 1 : 0]);
  const { t, f } = useI18n();

  return (
    <section ref={ref} className="relative h-[26rem] w-full overflow-hidden sm:h-[30rem]">
      <motion.div style={{ y, scale }} className="absolute inset-0 will-change-transform">
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
      <motion.div style={{ opacity: fade, y: titleY }} className="absolute inset-x-0 bottom-0 mx-auto max-w-4xl px-4 pb-20 text-white">
        <motion.div {...rise(0)} className="mb-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">📍 {trip.destination}</span>
          {trip.isAIGenerated && <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">✨ {t("trip.aiGenerated")}</span>}
        </motion.div>
        <h1 className="text-4xl font-extrabold tracking-tight drop-shadow-sm sm:text-6xl">
          {trip.title.split(" ").map((word, i) => (
            <span key={i} className="inline-block overflow-hidden pb-[0.1em] align-bottom">
              <motion.span
                className="inline-block"
                initial={{ y: "105%" }}
                animate={{ y: "0%" }}
                transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.1 + i * 0.08 }}
              >
                {word}
              </motion.span>
              &nbsp;
            </span>
          ))}
        </h1>
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
    { label: t("trip.statDays"), value: trip.subTrips.length, suffix: "" },
    { label: t("trip.statActivities"), value: total, suffix: "" },
    { label: t("trip.statDone"), value: percent, suffix: "%" },
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
            <p className="text-2xl font-extrabold tabular-nums sm:text-3xl">
              <CountUp value={s.value} suffix={s.suffix} />
            </p>
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

/** A day of the itinerary; it rises in as it scrolls into view. */
function DaySection({ id, children }: { id: string; children: ReactNode }) {
  return (
    <motion.section
      id={`day-${id}`}
      data-day={id}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className="mt-10"
    >
      {children}
    </motion.section>
  );
}

/** A solid line that draws down the dashed timeline as you read through the day. */
function TimelineFill() {
  const ref = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 55%"] });
  const scaleY = useParallax(scrollYProgress, 0, 1);
  return (
    <span ref={ref} aria-hidden className="pointer-events-none absolute motion-reduce:hidden -left-[2px] bottom-0 top-0 w-0.5">
      <motion.span style={{ scaleY }} className="absolute inset-0 origin-top rounded-full bg-gradient-to-b from-primary to-emerald-400" />
    </span>
  );
}

/** Slides an activity card in from the timeline the first time it scrolls into view. */
function RevealOnScroll({ index, children }: { index: number; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: Math.min(index, 4) * 0.06 }}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to a number when it first shows, and eases between later changes. */
function CountUp({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const shown = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduce) {
      el.textContent = `${value}${suffix}`;
      shown.current = value;
      return;
    }
    const controls = animate(shown.current, value, {
      duration: 0.9,
      ease: EASE_OUT,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = `${Math.round(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, value, suffix, reduce]);
  return <span ref={ref}>{`0${suffix}`}</span>;
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
