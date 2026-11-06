"use client";

import { useI18n } from "@trip/i18n/react";
import {
  FLIGHT_PATH,
  flightPoint,
  formatElapsed,
  PLANNING_FACT_EVERY,
  PLANNING_SLOW_AFTER,
  PLANNING_STAGES,
  PLANNING_STOPS,
  planningProgress,
  planningStage,
} from "@trip/ui";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useId, useState } from "react";
import { EASE_OUT } from "@/lib/motion";

/** One emoji per stage, shown on that stage's stop along the route. */
const STAGE_EMOJI = ["📝", "🏘️", "🍜", "⚖️", "📍"] as const;
const FACTS = [
  { key: "planning.fact1", emoji: "🏝️" },
  { key: "planning.fact2", emoji: "🗼" },
  { key: "planning.fact3", emoji: "✈️" },
  { key: "planning.fact4", emoji: "🦟" },
  { key: "planning.fact5", emoji: "🛶" },
  { key: "planning.fact6", emoji: "🏞️" },
  { key: "planning.fact7", emoji: "🚉" },
  { key: "planning.fact8", emoji: "🌳" },
  { key: "planning.fact9", emoji: "🏙️" },
  { key: "planning.fact10", emoji: "🥐" },
] as const;
/** The scene is 5:3 (height / width), so the plane's heading matches what is drawn. */
const SCENE_ASPECT = 0.6;

/** Milliseconds since the component mounted, updated a few times a second. */
function useElapsed(every = 250) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - start), every);
    return () => clearInterval(id);
  }, [every]);
  return elapsed;
}

/**
 * Shown while the AI plans a trip, which can take close to a minute. A plane flies the
 * route at the pace of the progress bar and drops a stop for each stage, a checklist
 * shows what's happening, and a card serves travel facts to read while waiting.
 */
export function Planning({ prompt }: { prompt: string }) {
  const { t } = useI18n();
  const elapsed = useElapsed();
  const stage = planningStage(elapsed);
  const progress = planningProgress(elapsed);
  const status = t(`generate.${PLANNING_STAGES[stage]!.key}`);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className="flex flex-col gap-5"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("generate.eyebrow")}</p>
          <h1 className="mt-1 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">{t("planning.title")}</h1>
        </div>
        <span aria-hidden className="shrink-0 rounded-full border border-border bg-card px-3 py-1 font-mono text-sm tabular-nums text-muted-foreground shadow-sm">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <FlightScene progress={progress} stage={stage} status={status} />

      <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
        <StageList stage={stage} />
        <div className="flex flex-col gap-4">
          <FactCard />
          {prompt.trim() && (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("planning.yourRequest")}</p>
              <p className="mt-2 line-clamp-4 text-pretty text-sm">&ldquo;{prompt}&rdquo;</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={elapsed > PLANNING_SLOW_AFTER ? "slow" : "usual"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-center text-sm text-muted-foreground"
        >
          {elapsed > PLANNING_SLOW_AFTER ? t("planning.slow") : t("generate.usuallyTakes")}
        </motion.p>
      </AnimatePresence>
    </motion.div>
  );
}

/** The sky card: drifting clouds, a glowing sun, and the plane flying the dotted route. */
function FlightScene({ progress, stage, status }: { progress: number; stage: number; status: string }) {
  const reduce = useReducedMotion();
  const maskId = useId();
  // Springs between the ticks so the plane glides instead of hopping.
  const target = useMotionValue(progress);
  useEffect(() => target.set(progress), [target, progress]);
  const flown = useSpring(target, { stiffness: 30, damping: 18 });

  return (
    <div className="relative aspect-[5/3] w-full overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-emerald-500 to-sky-500 shadow-2xl shadow-primary/20 dark:from-emerald-900 dark:via-primary/70 dark:to-sky-900">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle,rgb(255_255_255/0.18)_1px,transparent_1px)] [background-size:22px_22px]" />

      {/* Sun */}
      <motion.div
        aria-hidden
        className="absolute right-[9%] top-[12%] h-[18%] aspect-square rounded-full bg-amber-300 shadow-[0_0_60px_20px_rgb(252_211_77/0.45)]"
        animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Clouds at three depths: far ones are smaller, fainter and slower. */}
      {!reduce &&
        [
          { top: "16%", size: 0.7, duration: 34, delay: -6, opacity: 0.5 },
          { top: "48%", size: 1, duration: 24, delay: -16, opacity: 0.75 },
          { top: "70%", size: 1.25, duration: 18, delay: -3, opacity: 0.9 },
        ].map((c) => (
          <motion.div
            key={c.top}
            aria-hidden
            className="absolute"
            style={{ top: c.top, opacity: c.opacity, scale: c.size }}
            initial={{ left: "110%" }}
            animate={{ left: "-30%" }}
            transition={{ duration: c.duration, delay: c.delay, repeat: Infinity, ease: "linear" }}
          >
            <Cloud />
          </motion.div>
        ))}

      {/* The route: faint dots for the whole way, bright dots for the part already flown. */}
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <mask id={maskId}>
            <motion.path d={FLIGHT_PATH} fill="none" stroke="white" strokeWidth={14} style={{ pathLength: flown }} />
          </mask>
        </defs>
        <path d={FLIGHT_PATH} fill="none" stroke="white" strokeOpacity={0.35} strokeWidth={2.5} strokeDasharray="0.1 9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={FLIGHT_PATH} fill="none" stroke="white" strokeWidth={3.5} strokeDasharray="0.1 9" strokeLinecap="round" vectorEffect="non-scaling-stroke" mask={`url(#${maskId})`} />
      </svg>

      {/* Destination flag, waiting at the end of the route */}
      <Marker at={1} className="text-2xl opacity-70">
        🏁
      </Marker>

      {/* A stop drops onto the route as each stage begins. */}
      {PLANNING_STOPS.map((at, i) => (
        <Marker key={i} at={at}>
          <AnimatePresence>
            {i <= stage && (
              <motion.span
                initial={{ opacity: 0, scale: 0.3, y: -18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0.5, duration: 0.7 }}
                className="relative grid h-8 w-8 place-items-center rounded-full bg-white text-base shadow-lg sm:h-10 sm:w-10 sm:text-lg"
              >
                {i === stage && !reduce && (
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-white"
                    animate={{ scale: [1, 1.9], opacity: [0.8, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                {STAGE_EMOJI[i]}
              </motion.span>
            )}
          </AnimatePresence>
        </Marker>
      ))}

      <Plane flown={flown} bob={!reduce} />

      {/* Sparkles: the AI at work */}
      {!reduce &&
        [
          { left: "22%", top: "22%", delay: 0 },
          { left: "62%", top: "30%", delay: 0.9 },
          { left: "44%", top: "62%", delay: 1.7 },
        ].map((s) => (
          <motion.span
            key={s.left}
            aria-hidden
            className="absolute text-sm text-white"
            style={{ left: s.left, top: s.top }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.1, 0.4], rotate: [0, 90, 180] }}
            transition={{ duration: 2.4, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
          >
            ✦
          </motion.span>
        ))}

      {/* What's happening now, read aloud by screen readers as it changes */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-4">
        <div role="status" aria-live="polite" className="flex max-w-full items-center gap-2.5 rounded-full border border-white/25 bg-black/20 px-4 py-2 text-white shadow-lg backdrop-blur-md">
          <ThinkingDots className="bg-white" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={status}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="truncate text-sm font-semibold sm:text-base"
            >
              {status}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* Progress along the bottom edge */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
        <motion.div className="h-full origin-left bg-white" style={{ scaleX: flown }} />
      </div>
    </div>
  );
}

/** Places its children centered on the route, `at` of the way along (0..1). */
function Marker({ at, className = "", children }: { at: number; className?: string; children: React.ReactNode }) {
  const p = flightPoint(at, SCENE_ASPECT);
  return (
    <div aria-hidden className={`absolute -translate-x-1/2 -translate-y-1/2 ${className}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
      {children}
    </div>
  );
}

function Plane({ flown, bob }: { flown: MotionValue<number>; bob: boolean }) {
  const left = useTransform(flown, (v) => `${flightPoint(v, SCENE_ASPECT).x}%`);
  const top = useTransform(flown, (v) => `${flightPoint(v, SCENE_ASPECT).y}%`);
  const rotate = useTransform(flown, (v) => flightPoint(v, SCENE_ASPECT).angle);
  return (
    <motion.div aria-hidden className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left, top }}>
      <motion.div style={{ rotate }}>
        <motion.div animate={bob ? { y: [-2, 2, -2] } : undefined} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
          <svg viewBox="0 0 48 48" className="h-10 w-10 drop-shadow-[0_6px_10px_rgb(0_0_0/0.3)] sm:h-12 sm:w-12">
            {/* Points right, so a rotation of 0 flies along +x. */}
            <path
              fill="white"
              d="M44 24c0-1.7-1.4-3-3.1-3H29.5L19.2 5.6A1.5 1.5 0 0 0 18 5h-3.3a1 1 0 0 0-.9 1.3L18.6 21H9.8l-3.2-4.3A1.5 1.5 0 0 0 5.4 16H3a1 1 0 0 0-.9 1.3L4.7 24l-2.6 6.7A1 1 0 0 0 3 32h2.4c.5 0 .9-.2 1.2-.6L9.8 27h8.8l-4.8 14.7a1 1 0 0 0 .9 1.3H18c.5 0 .9-.2 1.2-.6L29.5 27h11.4c1.7 0 3.1-1.3 3.1-3Z"
            />
          </svg>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function Cloud() {
  return (
    <svg viewBox="0 0 120 50" className="h-10 w-24 fill-white sm:h-12 sm:w-28">
      <path d="M28 46h70a20 20 0 0 0 2-40 26 26 0 0 0-49 6 18 18 0 0 0-23 34Z" />
    </svg>
  );
}

/** The five stages as a checklist: done, in progress, still to come. */
function StageList({ stage }: { stage: number }) {
  const { t } = useI18n();
  return (
    <ol className="flex flex-col gap-1 rounded-3xl border border-border bg-card p-3 shadow-sm">
      {PLANNING_STAGES.map((s, i) => {
        const state = i < stage ? "done" : i === stage ? "active" : "todo";
        return (
          <li key={s.key} className={`relative flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors ${state === "active" ? "bg-primary/8" : ""}`}>
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold transition-colors ${
                state === "done" ? "border-success bg-success text-card" : state === "active" ? "border-primary text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {state === "done" ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease: EASE_OUT }} />
                </svg>
              ) : state === "active" ? (
                <ThinkingDots className="bg-primary" size="sm" />
              ) : (
                i + 1
              )}
            </span>
            <span className={`text-sm ${state === "active" ? "font-semibold" : state === "done" ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
              {t(`generate.${s.key}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** "While you wait": a travel fact that changes every few seconds. */
function FactCard() {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    // Start somewhere random (after mount, so server and client render the same first fact).
    const first = setTimeout(() => setIndex(Math.floor(Math.random() * FACTS.length)), 0);
    const id = setInterval(() => setIndex((i) => (i + 1) % FACTS.length), PLANNING_FACT_EVERY);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const fact = FACTS[index]!;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">💡 {t("planning.whileYouWait")}</p>
      <div className="mt-3 min-h-[4.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="flex items-start gap-3"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-muted text-xl">{fact.emoji}</span>
            <p className="text-pretty text-sm font-medium leading-relaxed">{t(fact.key)}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div aria-hidden className="mt-3 flex gap-1">
        {FACTS.map((_, i) => (
          <span key={i} className={`h-1 rounded-full transition-all duration-300 ${i === index ? "w-4 bg-primary" : "w-1 bg-border"}`} />
        ))}
      </div>
    </div>
  );
}

/** Three bouncing dots, the "AI is thinking" signal. `className` sets their color. */
export function ThinkingDots({ className = "bg-current", size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const dot = size === "sm" ? "h-1 w-1" : "h-1.5 w-1.5";
  return (
    <span aria-hidden className="inline-flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={`${dot} rounded-full ${className}`}
          animate={{ y: [0, -3, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

/** Laid over the request box while "Improve with AI" reads it: a light sweep and a status pill. */
export function ImprovingOverlay({ show }: { show: boolean }) {
  const { t } = useI18n();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
        >
          <div className="absolute inset-0 rounded-3xl ring-2 ring-primary/50" />
          <motion.div
            className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-primary/15 to-transparent motion-reduce:hidden"
            initial={{ left: "-50%" }}
            animate={{ left: "100%" }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 grid place-items-center p-4">
            <motion.div
              role="status"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", bounce: 0.35, duration: 0.5 }}
              className="flex max-w-sm flex-col items-center gap-1 rounded-2xl border border-border bg-card/90 px-5 py-3 text-center shadow-xl shadow-primary/10 backdrop-blur"
            >
              <span className="flex items-center gap-2 font-semibold">
                <motion.span animate={{ rotate: [0, 20, -10, 0], scale: [1, 1.2, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>
                  ✨
                </motion.span>
                {t("generate.improving")}
              </span>
              <span className="text-xs text-muted-foreground">{t("planning.improvingHint")}</span>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
