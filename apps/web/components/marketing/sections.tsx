"use client";

import { useI18n } from "@trip/i18n/react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { EASE_OUT, useParallax, useTilt } from "@/lib/motion";
import { SmartImage } from "../smart-image";
import { unsplash } from "./photos";

/** Thin bar under the header that fills as the page scrolls. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, mass: 0.3 });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-16 z-40 h-0.5 origin-left bg-gradient-to-r from-primary via-emerald-400 to-sky-400"
    />
  );
}

const PLACES = [
  ["🇯🇵", "Tokyo"],
  ["🇵🇹", "Lisbon"],
  ["🇲🇽", "Mexico City"],
  ["🇫🇷", "Paris"],
  ["🇮🇸", "Reykjavík"],
  ["🇿🇦", "Cape Town"],
  ["🇺🇸", "New York"],
  ["🇮🇩", "Bali"],
  ["🇮🇹", "Rome"],
  ["🇰🇷", "Seoul"],
  ["🇦🇷", "Buenos Aires"],
  ["🇲🇦", "Marrakesh"],
  ["🇦🇺", "Sydney"],
  ["🇹🇭", "Bangkok"],
] as const;

/** Two rows of destinations that slide in opposite directions as you scroll past. */
export function DestinationMarquee() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const left = useParallax(scrollYProgress, 0, -420);
  const right = useParallax(scrollYProgress, -420, 0);
  const rows = [
    { x: left, items: PLACES },
    { x: right, items: [...PLACES].reverse() },
  ];
  return (
    <div ref={ref} aria-hidden className="relative -rotate-2 overflow-hidden py-6 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      {rows.map((row, r) => (
        <motion.ul key={r} style={{ x: row.x }} className="flex w-max gap-3 py-1.5 will-change-transform">
          {[...row.items, ...row.items].map(([flag, name], i) => (
            <li
              key={`${name}-${i}`}
              className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-5 py-2.5 text-lg font-bold tracking-tight ${
                (i + r) % 3 === 0 ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-card/80 text-foreground"
              }`}
            >
              <span>{flag}</span>
              {name}
            </li>
          ))}
        </motion.ul>
      ))}
    </div>
  );
}

const HOW = ["how1", "how2", "how3"] as const;
const MOCK = [
  { time: "08:30", emoji: "⛩️", title: "Senso-ji Temple", tint: "bg-rose-500/15" },
  { time: "11:30", emoji: "🍤", title: "Tsukiji Outer Market", tint: "bg-amber-500/15" },
  { time: "14:00", emoji: "🌳", title: "Meiji Jingu", tint: "bg-emerald-500/15" },
  { time: "18:30", emoji: "🌃", title: "Shibuya Sky", tint: "bg-indigo-500/15" },
] as const;

/**
 * "How it works": on large screens the phone mockup stays pinned while the page
 * scrolls through three steps, and the mockup plays each one out. On small screens
 * and with reduced motion it becomes a plain list with the finished mockup.
 */
export function HowItWorks() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [phase, setPhase] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    if (reduce) return;
    // 0: typing, 1: days appear, 2: checking off, 3: all done
    setPhase(p < 0.22 ? 0 : p < 0.55 ? 1 : p < 0.85 ? 2 : 3);
  });
  const step = Math.min(phase, 2);

  return (
    <section className="mx-auto max-w-6xl px-4">
      <SectionTitle eyebrow={t("landing.howEyebrow")} title={t("landing.howTitle")} />

      {/* Pinned, scroll-driven version */}
      <div ref={ref} className="relative hidden h-[240vh] lg:block motion-reduce:lg:hidden">
        <div className="sticky top-24 grid h-[calc(100svh-8rem)] min-h-[34rem] grid-cols-[1fr_auto] items-center gap-16">
          <ol className="flex flex-col gap-3">
            {HOW.map((h, i) => (
              <li key={h} className="relative">
                <motion.div
                  animate={{ opacity: step === i ? 1 : 0.4, x: step === i ? 0 : -6 }}
                  transition={{ duration: 0.4, ease: EASE_OUT }}
                  className="relative overflow-hidden rounded-3xl p-6"
                >
                  {step === i && (
                    <motion.span layoutId="how-active" transition={{ type: "spring", bounce: 0.2, duration: 0.5 }} className="absolute inset-0 -z-10 rounded-3xl border border-border bg-card shadow-xl shadow-black/5" />
                  )}
                  <div className="flex items-center gap-4">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sm font-extrabold ${step === i ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{i + 1}</span>
                    <div>
                      <h3 className="text-xl font-bold">{t(`landing.${h}Title`)}</h3>
                      <p className="mt-1 text-muted-foreground">{t(`landing.${h}Body`)}</p>
                    </div>
                  </div>
                  {step === i && <StepBar progress={scrollYProgress} index={i} />}
                </motion.div>
              </li>
            ))}
          </ol>
          <PhoneMock phase={phase} />
        </div>
      </div>

      {/* Stacked version for phones, tablets and reduced motion */}
      <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-center lg:hidden motion-reduce:lg:grid">
        <ol className="flex flex-col gap-4">
          {HOW.map((h, i) => (
            <motion.li
              key={h}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: i * 0.08 }}
              className="flex items-start gap-4 rounded-3xl border border-border bg-card/80 p-5"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-extrabold text-primary-foreground">{i + 1}</span>
              <div>
                <h3 className="text-lg font-bold">{t(`landing.${h}Title`)}</h3>
                <p className="mt-1 text-muted-foreground">{t(`landing.${h}Body`)}</p>
              </div>
            </motion.li>
          ))}
        </ol>
        <InViewPhone />
      </div>
    </section>
  );
}

/** Fills across the active step as you scroll through its third of the section. */
function StepBar({ progress, index }: { progress: MotionValue<number>; index: number }) {
  const ranges = [
    [0, 0.22],
    [0.22, 0.55],
    [0.55, 0.85],
  ] as const;
  const scaleX = useTransform(progress, [...ranges[index]], [0, 1]);
  return (
    <div className="ml-14 mt-4 h-1 overflow-hidden rounded-full bg-muted">
      <motion.div style={{ scaleX }} className="h-full origin-left rounded-full bg-primary" />
    </div>
  );
}

/** Plays the mockup to its end once it scrolls into view. */
function InViewPhone() {
  const [phase, setPhase] = useState(0);
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="mx-auto"
      onViewportEnter={() => {
        if (reduce) return setPhase(3);
        setPhase(1);
        setTimeout(() => setPhase(2), 1400);
        setTimeout(() => setPhase(3), 2600);
      }}
      viewport={{ once: true, margin: "-80px" }}
    >
      <PhoneMock phase={phase} />
    </motion.div>
  );
}

function PhoneMock({ phase }: { phase: number }) {
  const { t, f } = useI18n();
  const prompt = t("landing.mockPrompt");
  const showDays = phase >= 1;
  const doneCount = phase >= 3 ? MOCK.length : phase === 2 ? 2 : 0;

  return (
    <div className="relative w-[19rem]">
      <div aria-hidden className="absolute -inset-10 -z-10 rounded-full bg-primary/20 blur-3xl" />
      <div className="rounded-[2.6rem] border border-border bg-foreground/90 p-2.5 shadow-2xl shadow-black/25">
        <div className="relative h-[34rem] overflow-hidden rounded-[2.1rem] bg-background">
          <div className="mx-auto mt-2 h-5 w-24 rounded-full bg-foreground/90" />
          <div className="flex flex-col gap-3 p-4">
            {/* Prompt bar types itself out */}
            <div className="rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">✨ {t("nav.planWithAI")}</p>
              <p className="mt-1 min-h-[2.5rem] font-medium">
                <TypeOut text={prompt} play={phase === 0} done={phase > 0} />
              </p>
            </div>

            <AnimatePresence mode="wait">
              {!showDays ? (
                <motion.div key="planning" exit={{ opacity: 0, y: -8 }} className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-primary"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }}
                      />
                    ))}
                  </span>
                  {t("landing.mockPlanning")}
                </motion.div>
              ) : (
                <motion.div key="days" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-bold">{t("time.dayN", { day: 1 })} · Asakusa</p>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                      {doneCount}/{MOCK.length}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400" animate={{ width: `${(doneCount / MOCK.length) * 100}%` }} transition={{ duration: 0.6, ease: EASE_OUT }} />
                  </div>
                  {MOCK.map((m, i) => {
                    const done = i < doneCount;
                    return (
                      <motion.div
                        key={m.title}
                        initial={{ opacity: 0, x: 24, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.1 + i * 0.12 }}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-sm"
                      >
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg ${m.tint}`}>{m.emoji}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-semibold transition ${done ? "text-muted-foreground line-through" : ""}`}>{m.title}</span>
                          <span className="block text-xs text-muted-foreground">{f.time(m.time)}</span>
                        </span>
                        <motion.span
                          animate={done ? { scale: [1, 1.25, 1], backgroundColor: "var(--success)" } : { scale: 1, backgroundColor: "var(--muted)" }}
                          transition={{ duration: 0.35, delay: done ? i * 0.15 : 0 }}
                          className="grid h-6 w-6 place-items-center rounded-full text-[11px] text-card"
                        >
                          {done && "✓"}
                        </motion.span>
                      </motion.div>
                    );
                  })}
                  <AnimatePresence>
                    {phase >= 3 && (
                      <motion.p
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: "spring", bounce: 0.5, duration: 0.6 }}
                        className="mx-auto mt-1 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success"
                      >
                        🎉 {t("landing.mockReady")}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reveals text letter by letter with a blinking caret while `play` is on. */
function TypeOut({ text, play, done }: { text: string; play: boolean; done: boolean }) {
  const chars = Array.from(text);
  return (
    <span>
      {chars.map((c, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ opacity: play || done ? 1 : 0 }}
          transition={{ duration: 0.01, delay: play ? i * 0.03 : 0 }}
        >
          {c}
        </motion.span>
      ))}
      {!done && <span className="animate-caret ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-primary" />}
    </span>
  );
}

const FEATURES = [
  { emoji: "✨", title: "feature1Title", body: "feature1Body", glow: "from-primary/25" },
  { emoji: "🧲", title: "feature2Title", body: "feature2Body", glow: "from-sky-400/25" },
  { emoji: "✅", title: "feature3Title", body: "feature3Body", glow: "from-accent/25" },
] as const;

/** Feature cards that tilt toward the pointer, with a spotlight that follows it. */
export function Features() {
  const { t } = useI18n();
  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-4 [perspective:1000px] sm:grid-cols-3">
      {FEATURES.map((feat, i) => (
        <motion.div
          key={feat.title}
          initial={{ opacity: 0, y: 40, rotateX: 12 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: EASE_OUT, delay: i * 0.1 }}
        >
          <TiltCard className="h-full">
            <span className={`absolute -right-10 -top-10 -z-10 h-40 w-40 rounded-full bg-gradient-to-br ${feat.glow} to-transparent blur-2xl`} />
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              whileInView={{ scale: 1, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", bounce: 0.5, duration: 0.8, delay: 0.2 + i * 0.1 }}
              className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-2xl"
            >
              {feat.emoji}
            </motion.span>
            <h2 className="mt-5 text-lg font-bold">{t(`landing.${feat.title}`)}</h2>
            <p className="mt-1.5 text-muted-foreground">{t(`landing.${feat.body}`)}</p>
          </TiltCard>
        </motion.div>
      ))}
    </section>
  );
}

/** Tilts a few degrees toward the pointer and lights the spot under it. */
export function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const tilt = useTilt<HTMLDivElement>();
  return (
    <motion.div
      {...tilt}
      className={`spotlight group relative isolate overflow-hidden rounded-3xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur transition-shadow hover:shadow-xl ${className}`}
    >
      {children}
    </motion.div>
  );
}

const GALLERY = [
  [
    { id: "1499856871958-5b9627545d1a", cat: "sightseeing", emoji: "🏛️" },
    { id: "1504674900247-0877df9cc836", cat: "food", emoji: "🍽️" },
  ],
  [
    { id: "1501785888041-af3ef285b470", cat: "nature", emoji: "🏞️" },
    { id: "1514525253161-7a46d19cd819", cat: "nightlife", emoji: "🌃" },
    { id: "1441986300917-64674bd600d8", cat: "shopping", emoji: "🛍️" },
  ],
  [
    { id: "1566073771259-6a8506099945", cat: "lodging", emoji: "🛏️" },
    { id: "1474487548417-781cb71495f3", cat: "transport", emoji: "🚆" },
  ],
] as const;

/** Three photo columns that move at different speeds, with the title floating over them. */
export function ParallaxGallery() {
  const { t, category } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const speeds = [useParallax(scrollYProgress, 40, -80), useParallax(scrollYProgress, 120, -160), useParallax(scrollYProgress, 0, -40)];

  return (
    <section ref={ref} className="relative mx-auto max-w-6xl overflow-hidden px-4 py-10">
      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <SectionTitle eyebrow={t("landing.galleryEyebrow")} title={t("landing.galleryTitle")} center />
      </div>
      <div className="grid pb-16 grid-cols-2 gap-4 sm:grid-cols-3">
        {GALLERY.map((col, c) => (
          <motion.div key={c} style={{ y: speeds[c] }} className={`flex flex-col gap-4 will-change-transform ${c === 2 ? "hidden sm:flex" : ""} ${c === 1 ? "pt-16" : ""}`}>
            {col.map((p, i) => (
              <motion.figure
                key={p.id}
                initial={{ opacity: 0, scale: 0.92 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.7, ease: EASE_OUT, delay: i * 0.08 }}
                className="group relative overflow-hidden rounded-3xl shadow-lg ring-1 ring-border"
              >
                <SmartImage
                  src={unsplash(p.id, 700)}
                  seed={p.cat}
                  emoji={p.emoji}
                  className={i % 2 === 0 ? "h-72 sm:h-80" : "h-56 sm:h-64"}
                  imgClassName="transition-transform duration-700 ease-out group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <figcaption className="absolute bottom-3 left-3 rounded-full bg-white/20 px-3 py-1 text-sm font-semibold text-white backdrop-blur-md">
                  {p.emoji} {category(p.cat).text}
                </figcaption>
              </motion.figure>
            ))}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/** Closing call to action with a spinning gradient border and a magnetic button. */
export function FinalCta() {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-6xl px-4">
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
        className="conic-border relative isolate overflow-hidden rounded-[2.5rem] p-[2px]"
      >
        <div className="relative overflow-hidden rounded-[2.4rem] bg-slate-950 px-6 py-16 text-center text-white sm:py-20">
          <div aria-hidden className="animate-blob absolute -left-20 -top-20 h-72 w-72 rounded-full bg-primary/40 blur-3xl" />
          <div aria-hidden className="animate-blob absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-sky-500/30 blur-3xl [animation-delay:-6s]" />
          <motion.span
            aria-hidden
            className="absolute left-[8%] top-10 text-3xl"
            animate={{ y: [0, -14, 0], rotate: [0, 8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            🧳
          </motion.span>
          <motion.span
            aria-hidden
            className="absolute bottom-10 right-[10%] text-3xl"
            animate={{ y: [0, 12, 0], rotate: [0, -10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            🗺️
          </motion.span>
          <h2 className="relative mx-auto max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">{t("landing.ctaTitle")}</h2>
          <p className="relative mx-auto mt-4 max-w-lg text-lg text-white/75">{t("landing.ctaBody")}</p>
          <div className="relative mt-8 flex justify-center">
            <Magnetic>
              <Link
                href="/trips/new"
                className="shine group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-white px-7 py-3.5 text-lg font-bold text-slate-950 shadow-xl shadow-primary/30 transition active:scale-[0.97]"
              >
                ✨ {t("landing.cta")}
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </Magnetic>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/** Pulls its child a little toward the pointer while hovered. */
function Magnetic({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 200, damping: 15, mass: 0.3 });
  const y = useSpring(0, { stiffness: 200, damping: 15, mass: 0.3 });
  return (
    <motion.div
      style={{ x, y }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * 0.3);
        y.set((e.clientY - (r.top + r.height / 2)) * 0.4);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({ eyebrow, title, center }: { eyebrow: string; title: string; center?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className={`mb-10 ${center ? "text-center" : ""}`}
    >
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h2>
    </motion.div>
  );
}
