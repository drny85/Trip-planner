"use client";

import { useI18n } from "@trip/i18n/react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import Link from "next/link";
import { useRef } from "react";
import { EASE_OUT, rise, useParallax, usePointerParallax } from "@/lib/motion";
import { SmartImage } from "../smart-image";
import { unsplash } from "./photos";

/** Photo cards in the hero; depth sets how far each one drifts with scroll and pointer. */
const COLLAGE = [
  { id: "1540959733332-eab4deabeeaf", seed: "tokyo", label: "collageTokyo", className: "left-0 top-6 h-64 w-48 -rotate-6", depth: 0.5 },
  { id: "1478436127897-769e1b3f0f36", seed: "kyoto", label: "collageKyoto", className: "left-40 top-0 z-10 h-72 w-56 rotate-3", depth: 1 },
  { id: "1579584425555-c3ce17fd4351", seed: "food", label: "collageFood", className: "left-8 top-64 h-44 w-60 rotate-2", depth: 0.25 },
] as const;

const STEPS = ["step1", "step2", "step3"] as const;

// The dotted flight path drawn across the collage (viewBox 400 x 420).
const FLIGHT = "M 20 380 C 90 250, 160 330, 220 210 S 330 70, 390 40";

export function Hero() {
  const { t, f, category } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const pointer = usePointerParallax();

  const copyY = useParallax(scrollYProgress, 0, 120);
  const copyFade = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0]);
  const collageY = useParallax(scrollYProgress, 0, -140);
  const gridY = useParallax(scrollYProgress, 0, 200);
  const tiltX = useTransform(pointer.y, [-1, 1], [6, -6]);
  const tiltY = useTransform(pointer.x, [-1, 1], [-8, 8]);

  const words = t("landing.headline").split(" ");
  const accent = t("landing.headlineAccent").split(" ");

  return (
    <section ref={ref} className="relative">
      {/* Dotted grid backdrop that sinks slower than the page */}
      <motion.div
        aria-hidden
        style={{ y: gridY }}
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[46rem] bg-[radial-gradient(circle,color-mix(in_oklab,var(--foreground)_14%,transparent)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_72%)]"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:pt-24 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.1fr_1fr] lg:pb-28">
        <motion.div style={{ y: copyY, opacity: copyFade }} className="flex flex-col items-start gap-6">
          <motion.span {...rise(0)} className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            {t("landing.poweredBy")}
          </motion.span>

          {/* Headline: words rise and unblur one after another */}
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight [perspective:600px] sm:text-6xl lg:text-7xl">
            {words.map((w, i) => (
              <Word key={`w${i}`} index={i}>
                {w}
              </Word>
            ))}
            {accent.map((w, i) => (
              <Word key={`a${i}`} index={words.length + i} className="text-gradient-animated">
                {w}
              </Word>
            ))}
          </h1>

          <motion.p {...rise(5)} className="max-w-xl text-lg text-muted-foreground">
            {t("landing.intro")}
          </motion.p>
          <motion.div {...rise(6)} className="flex flex-wrap gap-3">
            <Link
              href="/trips/new"
              className="shine group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:shadow-xl hover:shadow-primary/30 active:scale-[0.97]"
            >
              {t("landing.cta")}
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <Link href="/trips" className="rounded-full border border-border bg-card/70 px-6 py-3 font-semibold backdrop-blur transition hover:bg-muted active:scale-[0.97]">
              {t("landing.viewTrips")}
            </Link>
          </motion.div>
          <motion.ol {...rise(7)} className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[11px] font-bold text-foreground">{i + 1}</span>
                {t(`landing.${s}`)}
              </li>
            ))}
          </motion.ol>
        </motion.div>

        {/* Collage: tilts toward the pointer, each card at its own depth */}
        <motion.div style={{ y: collageY }} className="relative mx-auto hidden h-[26rem] w-[25rem] [perspective:1200px] lg:block">
          <motion.div style={{ rotateX: tiltX, rotateY: tiltY }} className="relative h-full w-full [transform-style:preserve-3d]">
            <FlightPath />
            {COLLAGE.map((c, i) => (
              <CollageCard key={c.id} card={c} index={i} pointer={pointer} progress={scrollYProgress} alt={t(`landing.${c.label}`)} />
            ))}

            <Floating pointer={pointer} depth={1.4} delay={0.9} className="-right-6 bottom-10 z-20">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/90 p-3 pr-4 shadow-xl backdrop-blur">
                <CheckPop />
                <div className="text-sm">
                  <p className="font-semibold">{t("landing.sampleActivity")}</p>
                  <p className="text-muted-foreground">
                    {t("time.dayN", { day: 1 })} · {f.time("09:00")}
                  </p>
                </div>
              </div>
            </Floating>
            <Floating pointer={pointer} depth={1.8} delay={1.1} className="-left-10 top-48 z-20">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur">
                🍜 {category("food").text}
              </div>
            </Floating>
            <Floating pointer={pointer} depth={2.2} delay={1.3} className="-right-2 -top-4 z-20">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-orange-500 text-2xl shadow-lg shadow-accent/30">☀️</div>
            </Floating>
          </motion.div>
        </motion.div>
      </div>

      <ScrollHint label={t("landing.scrollHint")} progress={scrollYProgress} />
    </section>
  );
}

function Word({ children, index, className }: { children: string; index: number; className?: string }) {
  return (
    <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
      <motion.span
        className={`inline-block origin-bottom ${className ?? ""}`}
        initial={{ y: "100%", rotateX: -40, opacity: 0 }}
        animate={{ y: "0%", rotateX: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.1 + index * 0.07 }}
      >
        {children}
      </motion.span>
      &nbsp;
    </span>
  );
}

type Pointer = ReturnType<typeof usePointerParallax>;

function CollageCard({
  card,
  index,
  pointer,
  progress,
  alt,
}: {
  card: (typeof COLLAGE)[number];
  index: number;
  pointer: Pointer;
  progress: MotionValue<number>;
  alt: string;
}) {
  const px = useTransform(pointer.x, [-1, 1], [-18 * card.depth, 18 * card.depth]);
  const py = useTransform(pointer.y, [-1, 1], [-14 * card.depth, 14 * card.depth]);
  const scrollY = useParallax(progress, 0, -120 * card.depth);
  const y = useTransform([py, scrollY], ([a, b]) => (a as number) + (b as number));
  return (
    <motion.div style={{ x: px, y }} className={`absolute ${card.className}`}>
      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.9, rotate: -4 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.25 + index * 0.14 }}
        className="h-full w-full"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6 + index, repeat: Infinity, ease: "easeInOut" }}
          whileHover={{ scale: 1.04 }}
          className="h-full w-full overflow-hidden rounded-3xl border-4 border-card shadow-2xl"
        >
          <SmartImage src={unsplash(card.id)} seed={card.seed} alt={alt} className="h-full w-full" priority />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function Floating({
  children,
  pointer,
  depth,
  delay,
  className,
}: {
  children: React.ReactNode;
  pointer: Pointer;
  depth: number;
  delay: number;
  className: string;
}) {
  const x = useTransform(pointer.x, [-1, 1], [-16 * depth, 16 * depth]);
  const y = useTransform(pointer.y, [-1, 1], [-12 * depth, 12 * depth]);
  return (
    <motion.div style={{ x, y }} className={`absolute ${className}`}>
      <motion.div initial={{ opacity: 0, scale: 0.6, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", bounce: 0.45, duration: 0.8, delay }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

/** A green tick that draws itself in, like checking off the first stop. */
function CheckPop() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full bg-success text-card">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: EASE_OUT, delay: 1.4 }} />
      </svg>
    </span>
  );
}

/** A dotted route draws across the collage while a plane flies along it. */
function FlightPath() {
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-30 h-[420px] w-[400px] text-primary" aria-hidden>
      <svg viewBox="0 0 400 420" width={400} height={420} className="absolute inset-0 overflow-visible">
        <motion.path
          d={FLIGHT}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeDasharray="2 9"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.9 }}
          transition={{ duration: 1.8, ease: "easeInOut", delay: 0.6 }}
        />
        <motion.circle r={6} cx={20} cy={380} className="fill-primary" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 }} />
      </svg>
      {/* Hidden by CSS, not JS, under reduced motion so server and client markup match */}
      <motion.span
        className="absolute left-0 top-0 motion-reduce:hidden grid h-8 w-8 place-items-center rounded-full bg-card text-base shadow-lg ring-1 ring-border"
        style={{ offsetPath: `path("${FLIGHT}")`, offsetRotate: "0deg" }}
        initial={{ offsetDistance: "0%", opacity: 0 }}
        animate={{ offsetDistance: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.5, delay: 2.2, times: [0, 0.1, 0.9, 1] }}
      >
        ✈️
      </motion.span>
    </div>
  );
}

function ScrollHint({ label, progress }: { label: string; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0, 0.15], [1, 0]);
  return (
    <motion.div style={{ opacity }} className="pointer-events-none absolute inset-x-0 bottom-6 hidden justify-center lg:flex">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
        className="flex flex-col items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
      >
      <span className="flex h-9 w-6 justify-center rounded-full border-2 border-muted-foreground/40 pt-1.5">
        <span className="animate-scroll-dot h-2 w-1 rounded-full bg-muted-foreground/70" />
      </span>
      {label}
      </motion.div>
    </motion.div>
  );
}
