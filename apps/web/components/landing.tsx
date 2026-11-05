"use client";

import { useI18n } from "@trip/i18n/react";
import { motion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { EASE_OUT, rise } from "@/lib/motion";
import { SmartImage } from "./smart-image";
import { UpNext } from "./up-next";

const u = (id: string, w = 900) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

const COLLAGE = [
  { id: "1540959733332-eab4deabeeaf", seed: "tokyo", label: "collageTokyo", className: "left-0 top-6 h-64 w-48 -rotate-6", depth: 40 },
  { id: "1478436127897-769e1b3f0f36", seed: "kyoto", label: "collageKyoto", className: "left-40 top-0 z-10 h-72 w-56 rotate-3", depth: 80 },
  { id: "1579584425555-c3ce17fd4351", seed: "food", label: "collageFood", className: "left-8 top-64 h-44 w-60 rotate-2", depth: 20 },
] as const;

const FEATURES = [
  { emoji: "✨", title: "feature1Title", body: "feature1Body" },
  { emoji: "🧲", title: "feature2Title", body: "feature2Body" },
  { emoji: "✅", title: "feature3Title", body: "feature3Body" },
] as const;

const STEPS = ["step1", "step2", "step3"] as const;

export function Landing() {
  const { t, f } = useI18n();
  const { scrollY } = useScroll();
  const lift = useTransform(scrollY, [0, 600], [0, -60]);

  return (
    <main className="relative overflow-hidden">
      {/* Ambient gradient blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-blob absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="animate-blob absolute -right-24 top-40 h-[24rem] w-[24rem] rounded-full bg-accent/20 blur-3xl [animation-delay:-5s]" />
        <div className="animate-blob absolute bottom-0 left-1/3 h-[20rem] w-[20rem] rounded-full bg-sky-400/15 blur-3xl [animation-delay:-9s]" />
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-8 empty:hidden">
        <UpNext />
      </div>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-16 sm:pt-24 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col items-start gap-6">
          <motion.span {...rise(0)} className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            {t("landing.poweredBy")}
          </motion.span>
          <motion.h1 {...rise(1)} className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            {t("landing.headline")}{" "}
            <span className="bg-gradient-to-r from-primary via-emerald-500 to-sky-500 bg-clip-text text-transparent">{t("landing.headlineAccent")}</span>
          </motion.h1>
          <motion.p {...rise(2)} className="max-w-xl text-lg text-muted-foreground">
            {t("landing.intro")}
          </motion.p>
          <motion.div {...rise(3)} className="flex flex-wrap gap-3">
            <Link
              href="/trips/new"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:shadow-xl hover:shadow-primary/30 active:scale-[0.97]"
            >
              {t("landing.cta")}
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <Link href="/trips" className="rounded-full border border-border bg-card/70 px-6 py-3 font-semibold backdrop-blur transition hover:bg-muted active:scale-[0.97]">
              {t("landing.viewTrips")}
            </Link>
          </motion.div>
          <motion.ol {...rise(4)} className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[11px] font-bold text-foreground">{i + 1}</span>
                {t(`landing.${s}`)}
              </li>
            ))}
          </motion.ol>
        </div>

        {/* Floating photo collage */}
        <motion.div style={{ y: lift }} className="relative mx-auto hidden h-[26rem] w-[25rem] lg:block">
          {COLLAGE.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.2 + i * 0.12 }}
              className={`absolute ${c.className}`}
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6 + i, repeat: Infinity, ease: "easeInOut" }}
                className="h-full w-full overflow-hidden rounded-3xl border-4 border-card shadow-2xl"
              >
                <SmartImage src={u(c.id)} seed={c.seed} alt={t(`landing.${c.label}`)} className="h-full w-full" priority />
              </motion.div>
            </motion.div>
          ))}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.7 }}
            className="absolute -right-2 bottom-10 z-20 flex items-center gap-3 rounded-2xl border border-border bg-card/90 p-3 pr-4 shadow-xl backdrop-blur"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-success text-card">✓</span>
            <div className="text-sm">
              <p className="font-semibold">{t("landing.sampleActivity")}</p>
              <p className="text-muted-foreground">
                {t("time.dayN", { day: 1 })} · {f.time("09:00")}
              </p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-24 sm:grid-cols-3">
        {FEATURES.map((feat, i) => (
          <motion.div
            key={feat.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, ease: EASE_OUT, delay: i * 0.08 }}
            whileHover={{ y: -4 }}
            className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-muted text-xl">{feat.emoji}</span>
            <h2 className="mt-4 text-lg font-bold">{t(`landing.${feat.title}`)}</h2>
            <p className="mt-1.5 text-muted-foreground">{t(`landing.${feat.body}`)}</p>
          </motion.div>
        ))}
      </section>
    </main>
  );
}
