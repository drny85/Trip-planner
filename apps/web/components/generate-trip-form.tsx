"use client";

import { api } from "@trip/backend/api";
import { localeNames } from "@trip/i18n";
import { useI18n } from "@trip/i18n/react";
import { useAction } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";

const IDEAS = [
  { emoji: "🏯", text: "idea1" },
  { emoji: "🐟", text: "idea2" },
  { emoji: "🎨", text: "idea3" },
  { emoji: "🚗", text: "idea4" },
] as const;

const STATUS = ["status1", "status2", "status3", "status4", "status5"] as const;

export function GenerateTripForm() {
  const generate = useAction(api.ai.generateTrip);
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localFocus, setLocalFocus] = useState(false);
  const { t, locale } = useI18n();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tripId = await generate({ prompt, language: locale, localFocus });
      router.push(`/trips/${tripId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message.match(/Uncaught Error: (.*?)(\n|$)/)?.[1] ?? t("common.somethingWrong"));
      setLoading(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <Planning key="planning" prompt={prompt} />
      ) : (
        <motion.form key="form" onSubmit={submit} exit={{ opacity: 0, y: -12 }} className="flex flex-col gap-6">
          <motion.div {...rise(0)}>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("generate.eyebrow")}</p>
            <h1 className="mt-1 text-4xl font-extrabold tracking-tight">{t("generate.title")}</h1>
            <p className="mt-2 text-muted-foreground">{t("generate.intro")}</p>
          </motion.div>
          <motion.div {...rise(1)} className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              autoFocus
              rows={5}
              maxLength={2000}
              placeholder={t("generate.placeholder")}
              className="w-full resize-none rounded-3xl border border-border bg-card p-5 text-lg shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
            <span className="absolute bottom-4 right-5 text-xs text-muted-foreground">{prompt.length}/2000</span>
          </motion.div>
          <div className="flex flex-wrap gap-2">
            {IDEAS.map((idea, i) => (
              <motion.button
                key={idea.text}
                type="button"
                {...rise(i + 2)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setPrompt(t(`generate.${idea.text}`))}
                className="rounded-full border border-border bg-card px-3.5 py-2 text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                {idea.emoji} {t(`generate.${idea.text}`)}
              </motion.button>
            ))}
          </div>
          <motion.label
            {...rise(6)}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
          >
            <span className="text-2xl" aria-hidden>
              💎
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{t("local.hiddenGems")}</span>
              <span className="block text-sm text-muted-foreground">{t("local.hiddenGemsHint")}</span>
            </span>
            <input type="checkbox" role="switch" checked={localFocus} onChange={(e) => setLocalFocus(e.target.checked)} className="peer sr-only" />
            <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-4 peer-focus-visible:ring-primary/25 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
          </motion.label>
          <motion.button
            {...rise(7)}
            type="submit"
            whileTap={{ scale: 0.98 }}
            disabled={prompt.trim().length < 3}
            className="rounded-full bg-gradient-to-r from-primary to-emerald-500 px-6 py-3.5 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-opacity disabled:opacity-40"
          >
            ✨ {t("generate.submit")}
          </motion.button>
          <p className="-mt-3 text-center text-xs text-muted-foreground">{t("generate.writtenIn", { language: localeNames[locale] })}</p>
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl bg-danger/10 p-3 text-center text-danger"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.form>
      )}
    </AnimatePresence>
  );
}

function Planning({ prompt }: { prompt: string }) {
  const [step, setStep] = useState(0);
  const { t } = useI18n();
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % STATUS.length), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="flex flex-col items-center gap-8 py-16 text-center"
      role="status"
    >
      <div className="relative grid h-36 w-36 place-items-center">
        {[0, 1, 2].map((ring) => (
          <motion.span
            key={ring}
            className="absolute inset-0 rounded-full border-2 border-primary/40"
            animate={{ scale: [0.6, 1.4], opacity: [0.7, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: ring * 0.8, ease: "easeOut" }}
          />
        ))}
        <motion.span
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-primary to-emerald-500 text-3xl shadow-xl shadow-primary/40"
        >
          <motion.span animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}>
            ✈
          </motion.span>
        </motion.span>
      </div>
      <div className="h-8">
        <AnimatePresence mode="wait">
          <motion.p
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="text-xl font-semibold"
          >
            {t(`generate.${STATUS[step]!}`)}
          </motion.p>
        </AnimatePresence>
      </div>
      <p className="max-w-md text-muted-foreground">&ldquo;{prompt}&rdquo;</p>
      <p className="text-sm text-muted-foreground">{t("generate.usuallyTakes")}</p>
    </motion.div>
  );
}
