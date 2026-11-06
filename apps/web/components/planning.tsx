"use client";

import { useI18n } from "@trip/i18n/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE_OUT } from "@/lib/motion";

const STATUS = ["status1", "status2", "status3", "status4", "status5"] as const;

/** Shown while the planner works: pulsing rings and rotating status lines. */
export function Planning({ prompt }: { prompt: string }) {
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
