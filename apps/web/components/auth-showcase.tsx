"use client";

import { useI18n } from "@trip/i18n/react";
import { motion, useTransform } from "motion/react";
import { EASE_OUT, usePointerParallax } from "@/lib/motion";
import { unsplash } from "./marketing/photos";
import { SmartImage } from "./smart-image";

type Pointer = ReturnType<typeof usePointerParallax>;

/**
 * A sample itinerary card behind a "sign in to unlock" pill, used next to sign-in prompts.
 * It leans toward the pointer like the landing collage; reduced motion keeps it still.
 */
export function AuthShowcase() {
  const { t, f, category } = useI18n();
  const pointer = usePointerParallax();
  const rotateX = useTransform(pointer.y, [-1, 1], [5, -5]);
  const rotateY = useTransform(pointer.x, [-1, 1], [-7, 7]);

  const items = [
    { title: t("landing.sampleActivity"), time: "09:00", done: true, emoji: "⛩️" },
    { title: t("auth.previewItem2"), time: "11:30", done: false, emoji: "🍣" },
    { title: t("auth.previewItem3"), time: "17:00", done: false, emoji: "🌆" },
  ];

  return (
    <div className="relative mx-auto h-[30rem] w-full max-w-[26rem] [perspective:1200px]" aria-hidden>
      <motion.div style={{ rotateX, rotateY }} className="relative h-full w-full [transform-style:preserve-3d]">
        {/* Second photo peeking out behind the card */}
        <Drift pointer={pointer} depth={0.4} className="-right-4 top-4 h-64 w-48 sm:-right-8">
          <motion.div
            initial={{ opacity: 0, rotate: 0, y: 30 }}
            animate={{ opacity: 1, rotate: 8, y: 0 }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.25 }}
            className="h-full w-full overflow-hidden rounded-3xl border-4 border-card shadow-2xl"
          >
            <SmartImage src={unsplash("1478436127897-769e1b3f0f36", 600)} seed="kyoto" className="h-full w-full" priority />
          </motion.div>
        </Drift>

        <Drift pointer={pointer} depth={1} className="left-0 top-12 z-10 w-[19rem] sm:w-[21rem]">
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.1 }}
            className="overflow-hidden rounded-3xl border border-border bg-card shadow-2xl shadow-primary/10"
          >
            <div className="relative h-36">
              <SmartImage src={unsplash("1540959733332-eab4deabeeaf", 800)} seed="tokyo" className="h-full w-full" priority />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute inset-x-4 bottom-3 text-white">
                <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{t("time.dayN", { day: 1 })}</p>
                <p className="text-xl font-extrabold tracking-tight">{t("auth.previewTitle")}</p>
              </div>
            </div>
            <ul className="relative flex flex-col gap-1 p-3">
              {items.map((item, i) => (
                <motion.li
                  key={item.time}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.5 + i * 0.08 }}
                  className={`flex items-center gap-3 rounded-2xl p-2 ${i > 0 ? "blur-[3px]" : ""}`}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${item.done ? "border-success bg-success text-card" : "border-border"}`}>
                    {item.done && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: EASE_OUT, delay: 1 }} />
                      </svg>
                    )}
                  </span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-lg">{item.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${item.done ? "text-muted-foreground line-through" : ""}`}>{item.title}</span>
                    <span className="block text-xs text-muted-foreground">{f.time(item.time)}</span>
                  </span>
                </motion.li>
              ))}
              {/* Lock pill over the blurred rows */}
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", bounce: 0.4, duration: 0.7, delay: 0.9 }}
                className="absolute left-1/2 top-[62%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-xl"
              >
                <LockIcon />
                {t("auth.previewLocked")}
              </motion.span>
            </ul>
          </motion.div>
        </Drift>

        <Drift pointer={pointer} depth={1.8} className="-left-4 bottom-6 z-20 sm:-left-8">
          <Pop delay={1.1}>
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur">
              🍜 {category("food").text}
            </div>
          </Pop>
        </Drift>
        <Drift pointer={pointer} depth={2.2} className="right-6 bottom-16 z-20">
          <Pop delay={1.25}>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-orange-500 text-2xl shadow-lg shadow-accent/30">☀️</div>
          </Pop>
        </Drift>
      </motion.div>
    </div>
  );
}

function Drift({ children, pointer, depth, className }: { children: React.ReactNode; pointer: Pointer; depth: number; className: string }) {
  const x = useTransform(pointer.x, [-1, 1], [-14 * depth, 14 * depth]);
  const y = useTransform(pointer.y, [-1, 1], [-10 * depth, 10 * depth]);
  return (
    <motion.div style={{ x, y }} className={`absolute ${className}`}>
      {children}
    </motion.div>
  );
}

function Pop({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.6, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", bounce: 0.45, duration: 0.8, delay }}>
      {children}
    </motion.div>
  );
}

export function LockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** Dotted grid and soft color blobs behind the auth screens, matching the landing hero. */
export function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle,color-mix(in_oklab,var(--foreground)_14%,transparent)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_70%)]" />
      <div className="animate-blob absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/20 blur-3xl motion-reduce:animate-none" />
      <div className="animate-blob absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-sky-400/20 blur-3xl [animation-delay:-5s] motion-reduce:animate-none" />
    </div>
  );
}
