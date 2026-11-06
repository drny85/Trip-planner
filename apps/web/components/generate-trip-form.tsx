"use client";

import { api } from "@trip/backend/api";
import { appendAnswer, type ImproveQuestion, withTimeout } from "@trip/backend/promptAnswer";
import { localeNames } from "@trip/i18n";
import { useI18n } from "@trip/i18n/react";
import { useAction, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";
import { PlanLimitNotice } from "./billing";
import { ImprovingOverlay, Planning, ThinkingDots } from "./planning";
import { TripInterview } from "./trip-interview";

const IDEAS = [
  { emoji: "🏯", text: "idea1" },
  { emoji: "🐟", text: "idea2" },
  { emoji: "🎨", text: "idea3" },
  { emoji: "🚗", text: "idea4" },
] as const;

/** Plan with AI: the guided interview by default, with free text as a shortcut. */
export function GenerateTripForm() {
  const [mode, setMode] = useState<"interview" | "text">("interview");
  const plan = useQuery(api.billing.status, {});
  // Decided once on arrival, so saving the free trip doesn't swap the planning screen for the notice.
  // The server checks again; this just saves answering for a trip that can't be planned.
  const [gate, setGate] = useState<{ blocked: "subscribe" | "tooManyUpcoming" | null; max: number } | undefined>();
  if (plan && gate === undefined) setGate({ blocked: plan.blocked, max: plan.maxUpcoming });
  if (gate?.blocked) return <PlanLimitNotice blocked={gate.blocked} max={gate.max} />;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
      >
        {mode === "interview" ? <TripInterview onTypeInstead={() => setMode("text")} /> : <FreeTextForm onUseInterview={() => setMode("interview")} />}
      </motion.div>
    </AnimatePresence>
  );
}

function FreeTextForm({ onUseInterview }: { onUseInterview: () => void }) {
  const generate = useAction(api.ai.generateTrip);
  const improve = useAction(api.ai.improvePrompt);
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localFocus, setLocalFocus] = useState(false);
  // "Improve with AI": the person's own text (for Undo), and the missing-detail questions.
  const [original, setOriginal] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ImproveQuestion[]>([]);
  const [improving, setImproving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { t, locale } = useI18n();
  const ready = prompt.trim().length >= 3;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ready || improving) return;
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

  const runImprove = async () => {
    const mine = prompt;
    setImproving(true);
    setNotice(null);
    setError(null);
    // Slow or failed: keep the person's own text.
    const result = await withTimeout(improve({ prompt: mine, language: locale }));
    setImproving(false);
    if (!result?.ok) {
      setNotice(result?.reason === "limit" ? t("generate.improveLimit") : t("generate.improveFailed"));
      return;
    }
    setOriginal(mine);
    setPrompt(result.improved);
    setQuestions(result.questions);
  };

  const undo = () => {
    if (original !== null) setPrompt(original);
    setOriginal(null);
    setQuestions([]);
  };

  const answer = (index: number, addition: string) => {
    setPrompt((p) => appendAnswer(p, addition));
    setQuestions((qs) => qs.filter((_, i) => i !== index));
  };

  const improved = original !== null;

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
              onChange={(e) => {
                setPrompt(e.target.value);
                setNotice(null);
                // Clearing the box ends the improved state.
                if (!e.target.value.trim()) {
                  setOriginal(null);
                  setQuestions([]);
                }
              }}
              autoFocus
              rows={improved ? 8 : 5}
              maxLength={2000}
              readOnly={improving}
              aria-busy={improving}
              placeholder={t("generate.placeholder")}
              className={`w-full resize-none rounded-3xl border bg-card p-5 text-lg shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 ${
                improved ? "border-primary/50" : "border-border"
              } ${improving ? "text-muted-foreground" : ""}`}
            />
            <span className="absolute bottom-4 right-5 text-xs text-muted-foreground">{prompt.length}/2000</span>
            <ImprovingOverlay show={improving} />
          </motion.div>

          <AnimatePresence mode="popLayout">
            {improved ? (
              <motion.div
                key="improved"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="-mt-3 flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="text-primary">✨ {t("generate.improvedNote")}</span>
                <button
                  type="button"
                  onClick={undo}
                  className="rounded-full border border-border bg-card px-3 py-1 text-sm shadow-sm transition-colors hover:border-primary/40"
                >
                  ↺ {t("generate.undo")}
                </button>
              </motion.div>
            ) : (
              <motion.div key="ideas" exit={{ opacity: 0 }} className="flex flex-wrap gap-2">
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
              </motion.div>
            )}
          </AnimatePresence>

          {questions.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 rounded-3xl border border-border bg-card/60 p-4">
              <p className="text-sm font-semibold">{t("generate.questionsTitle")}</p>
              <AnimatePresence initial={false}>
                {questions.map((q, index) => (
                  <motion.div key={q.question} layout exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">{q.question}</p>
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((o) => (
                        <motion.button
                          key={o.label}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => answer(index, o.addition)}
                          title={o.addition}
                          className="rounded-full border border-border bg-card px-3 py-1.5 text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                        >
                          {o.label}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}

          <motion.label
            {...rise(5)}
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

          {improved ? (
            <motion.button
              {...rise(0)}
              type="submit"
              whileTap={{ scale: 0.98 }}
              disabled={!ready}
              className="rounded-full bg-gradient-to-r from-primary to-emerald-500 px-6 py-3.5 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-opacity disabled:opacity-40"
            >
              ✨ {t("generate.submit")}
            </motion.button>
          ) : (
            <motion.div {...rise(6)} className="flex flex-col gap-2">
              <AnimatePresence>
                {ready && !improving && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-sm text-muted-foreground">
                    {t("generate.choose")}
                  </motion.p>
                )}
              </AnimatePresence>
              <div className="grid gap-3 sm:grid-cols-2">
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.98 }}
                  disabled={!ready || improving}
                  className="rounded-full border border-border bg-card px-6 py-3.5 text-lg font-semibold shadow-sm transition-colors hover:border-primary/40 disabled:opacity-40"
                >
                  {t("generate.asIs")}
                </motion.button>
                <motion.button
                  type="button"
                  onClick={runImprove}
                  whileTap={{ scale: 0.98 }}
                  disabled={!ready || improving}
                  className="rounded-full bg-gradient-to-r from-primary to-emerald-500 px-6 py-3.5 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-opacity disabled:opacity-40"
                >
                  {improving ? <ThinkingDots className="bg-primary-foreground" /> : "✨"} {improving ? t("generate.improving") : t("generate.improve")}
                </motion.button>
              </div>
            </motion.div>
          )}
          <p className="-mt-3 text-center text-xs text-muted-foreground">{t("generate.writtenIn", { language: localeNames[locale] })}</p>
          <AnimatePresence>
            {notice && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="status"
                className="rounded-2xl bg-muted p-3 text-center text-sm text-muted-foreground"
              >
                {notice}
              </motion.p>
            )}
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
          <button type="button" onClick={onUseInterview} className="self-center text-sm font-medium text-primary underline-offset-4 hover:underline">
            💬 {t("interview.useInterview")}
          </button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
