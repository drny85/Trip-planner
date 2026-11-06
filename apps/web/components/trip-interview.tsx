"use client";

import { api } from "@trip/backend/api";
import {
  BUDGET_EMOJI,
  BUDGETS,
  INTEREST_EMOJI,
  INTERESTS,
  INTERVIEW_STEPS,
  type Interest,
  type InterviewStep,
  PACE_EMOJI,
  PACES,
  summaryParts,
  summaryPrompt,
  TRAVELER_EMOJI,
  TRAVELERS,
  TRIP_LENGTHS,
  type TripPreferences,
  upcomingMonths,
} from "@trip/backend/interview";
import { localeNames } from "@trip/i18n";
import { useI18n } from "@trip/i18n/react";
import { useAction } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { EASE_OUT, layoutSpring } from "@/lib/motion";
import { Planning } from "./planning";

const POPULAR = [
  { emoji: "🗼", name: "Tokyo" },
  { emoji: "🚋", name: "Lisbon" },
  { emoji: "🌮", name: "Mexico City" },
  { emoji: "🥐", name: "Paris" },
  { emoji: "🌴", name: "Bali" },
  { emoji: "🗽", name: "New York" },
] as const;

type Step = InterviewStep | "review";
const ORDER: Step[] = [...INTERVIEW_STEPS, "review"];

/**
 * The default way to plan: five short, skippable, tap-to-answer steps, then a
 * review. The answers go to the planner as exact rules (lib/interview.ts).
 */
export function TripInterview({ onTypeInstead }: { onTypeInstead: () => void }) {
  const generate = useAction(api.ai.generateTrip);
  const router = useRouter();
  const { t, f, locale } = useI18n();
  const [answers, setAnswers] = useState<TripPreferences>({ destination: "", interests: [] });
  const [step, setStep] = useState<Step>("where");
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const months = useMemo(() => upcomingMonths(6), []);
  const text = { t: t as (key: string, vars?: Record<string, string | number>) => string, month: f.month };

  const index = ORDER.indexOf(step);
  const go = (to: Step) => {
    setDirection(ORDER.indexOf(to) >= index ? 1 : -1);
    setStep(to);
  };
  const next = () => go(ORDER[Math.min(index + 1, ORDER.length - 1)]!);
  const back = () => go(ORDER[Math.max(index - 1, 0)]!);
  const set = <K extends keyof TripPreferences>(key: K, value: TripPreferences[K]) => setAnswers((a) => ({ ...a, [key]: value }));
  const toggle = <K extends "days" | "month" | "travelers" | "budget" | "pace">(key: K, value: NonNullable<TripPreferences[K]>) =>
    setAnswers((a) => ({ ...a, [key]: a[key] === value ? undefined : value }));
  const toggleInterest = (i: Interest) =>
    setAnswers((a) => ({ ...a, interests: a.interests?.includes(i) ? a.interests.filter((x) => x !== i) : [...(a.interests ?? []), i] }));

  const hasDestination = answers.destination.trim().length >= 2;

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const tripId = await generate({ prompt: summaryPrompt(answers, text), language: locale, preferences: answers });
      router.push(`/trips/${tripId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message.match(/Uncaught Error: (.*?)(\n|$)/)?.[1] ?? t("common.somethingWrong"));
      setLoading(false);
    }
  };

  if (loading) return <Planning prompt={summaryParts(answers, text).join(" · ")} />;

  const stepNumber = Math.min(index + 1, INTERVIEW_STEPS.length);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("generate.eyebrow")}</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex flex-1 gap-1.5" aria-hidden>
            {INTERVIEW_STEPS.map((s, i) => (
              <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500"
                  initial={false}
                  animate={{ width: i < index || step === "review" ? "100%" : i === index ? "50%" : "0%" }}
                  transition={{ duration: 0.5, ease: EASE_OUT }}
                />
              </div>
            ))}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {step === "review" ? "✓" : t("interview.stepOf", { current: stepNumber, total: INTERVIEW_STEPS.length })}
          </span>
        </div>
      </div>

      <div className="relative min-h-[22rem]">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 40 }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: d * -40 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: EASE_OUT }}
            className="flex flex-col gap-5"
          >
            {step === "where" && (
              <>
                <Title>{t("interview.whereTitle")}</Title>
                <input
                  value={answers.destination}
                  onChange={(e) => set("destination", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && hasDestination && next()}
                  autoFocus
                  maxLength={200}
                  placeholder={t("interview.wherePlaceholder")}
                  className="w-full rounded-3xl border border-border bg-card px-6 py-5 text-2xl font-semibold shadow-sm outline-none transition placeholder:font-normal focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                <Label>{t("interview.popular")}</Label>
                <div className="flex flex-wrap gap-2">
                  {POPULAR.map((p, i) => (
                    <Chip key={p.name} index={i} selected={answers.destination === p.name} onClick={() => set("destination", p.name)}>
                      {p.emoji} {p.name}
                    </Chip>
                  ))}
                </div>
              </>
            )}

            {step === "when" && (
              <>
                <Title>{t("interview.whenTitle")}</Title>
                <Label>{t("interview.lengthLabel")}</Label>
                <div className="flex flex-wrap gap-2">
                  {TRIP_LENGTHS.map((d, i) => (
                    <Chip key={d} index={i} selected={answers.days === d} onClick={() => toggle("days", d)}>
                      {t("interview.days", { count: d })}
                    </Chip>
                  ))}
                </div>
                <Label>{t("interview.monthLabel")}</Label>
                <div className="flex flex-wrap gap-2">
                  {months.map((m, i) => (
                    <Chip key={m} index={i} selected={answers.month === m} onClick={() => toggle("month", m)}>
                      {f.month(m)}
                    </Chip>
                  ))}
                  <Chip index={months.length} selected={!answers.month} onClick={() => set("month", undefined)}>
                    🗓️ {t("interview.flexible")}
                  </Chip>
                </div>
              </>
            )}

            {step === "who" && (
              <>
                <Title>{t("interview.whoTitle")}</Title>
                <Label>{t("interview.whoLabel")}</Label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {TRAVELERS.map((v, i) => (
                    <Tile key={v} index={i} selected={answers.travelers === v} onClick={() => toggle("travelers", v)} emoji={TRAVELER_EMOJI[v]} title={t(`interview.${v}`)} />
                  ))}
                </div>
                <Label>{t("interview.budgetLabel")}</Label>
                <div className="grid grid-cols-3 gap-3">
                  {BUDGETS.map((v, i) => (
                    <Tile key={v} index={i + 4} selected={answers.budget === v} onClick={() => toggle("budget", v)} emoji={BUDGET_EMOJI[v]} title={t(`interview.${v}`)} />
                  ))}
                </div>
              </>
            )}

            {step === "pace" && (
              <>
                <Title sub={t("interview.paceIntro")}>{t("interview.paceTitle")}</Title>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PACES.map((v, i) => (
                    <Tile
                      key={v}
                      index={i}
                      large
                      selected={answers.pace === v}
                      onClick={() => {
                        toggle("pace", v);
                        // One question on this step: move on after the tap registers.
                        if (answers.pace !== v) setTimeout(() => go("interests"), 320);
                      }}
                      emoji={PACE_EMOJI[v]}
                      title={t(`interview.${v}`)}
                      body={t(`interview.${v}Body`)}
                    />
                  ))}
                </div>
              </>
            )}

            {step === "interests" && (
              <>
                <Title sub={t("interview.interestsIntro")}>{t("interview.interestsTitle")}</Title>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((v, i) => (
                    <Chip key={v} index={i} selected={!!answers.interests?.includes(v)} onClick={() => toggleInterest(v)}>
                      {INTEREST_EMOJI[v]} {t(`interview.${v}`)}
                    </Chip>
                  ))}
                </div>
                <Label>{t("interview.notesLabel")}</Label>
                <textarea
                  value={answers.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={3}
                  maxLength={800}
                  placeholder={t("interview.notesPlaceholder")}
                  className="w-full resize-none rounded-3xl border border-border bg-card p-4 shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
              </>
            )}

            {step === "review" && (
              <>
                <Title sub={t("interview.reviewIntro")}>{t("interview.reviewTitle")}</Title>
                <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                  <ReviewRow index={0} label={t("interview.destinationLabel")} value={answers.destination} onClick={() => go("where")} />
                  <ReviewRow
                    index={1}
                    label={t("interview.whenLabel")}
                    value={[answers.days && t("interview.days", { count: answers.days }), answers.month ? f.month(answers.month) : t("interview.flexible")].filter(Boolean).join(" · ")}
                    onClick={() => go("when")}
                  />
                  <ReviewRow
                    index={2}
                    label={t("interview.whoBudgetLabel")}
                    value={[answers.travelers && `${TRAVELER_EMOJI[answers.travelers]} ${t(`interview.${answers.travelers}`)}`, answers.budget && t(`interview.${answers.budget}`)].filter(Boolean).join(" · ")}
                    onClick={() => go("who")}
                  />
                  <ReviewRow
                    index={3}
                    label={t("interview.paceLabel")}
                    value={answers.pace ? `${PACE_EMOJI[answers.pace]} ${t(`interview.${answers.pace}`)}` : ""}
                    onClick={() => go("pace")}
                  />
                  <ReviewRow
                    index={4}
                    label={t("interview.interestsLabel")}
                    value={[answers.interests?.map((i) => `${INTEREST_EMOJI[i]} ${t(`interview.${i}`)}`).join("  "), answers.notes].filter(Boolean).join(" · ")}
                    onClick={() => go("interests")}
                  />
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {step === "review" ? (
        <div className="flex flex-col gap-3">
          <motion.button
            type="button"
            onClick={submit}
            whileTap={{ scale: 0.98 }}
            className="rounded-full bg-gradient-to-r from-primary to-emerald-500 px-6 py-3.5 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/25"
          >
            ✨ {t("generate.submit")}
          </motion.button>
          <button type="button" onClick={back} className="text-sm text-muted-foreground hover:text-foreground">
            ← {t("interview.back")}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {index > 0 && (
            <button type="button" onClick={back} className="rounded-full px-4 py-3 font-medium text-muted-foreground transition-colors hover:text-foreground">
              ← {t("interview.back")}
            </button>
          )}
          <div className="flex-1" />
          {step !== "where" && (
            <button type="button" onClick={next} className="rounded-full px-4 py-3 font-medium text-muted-foreground transition-colors hover:text-foreground">
              {t("interview.skip")}
            </button>
          )}
          <motion.button
            type="button"
            onClick={next}
            disabled={!hasDestination}
            whileTap={{ scale: 0.97 }}
            className="rounded-full bg-gradient-to-r from-primary to-emerald-500 px-7 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-opacity disabled:opacity-40"
          >
            {t("interview.next")} →
          </motion.button>
        </div>
      )}

      <p className="-mt-2 text-center text-xs text-muted-foreground">{t("generate.writtenIn", { language: localeNames[locale] })}</p>
      {error && <p className="rounded-2xl bg-danger/10 p-3 text-center text-danger">{error}</p>}
      <button type="button" onClick={onTypeInstead} className="self-center text-sm font-medium text-primary underline-offset-4 hover:underline">
        ✍️ {t("interview.typeInstead")}
      </button>
    </div>
  );
}

function Title({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{children}</h1>
      {sub && <p className="mt-2 text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="-mb-2 text-sm font-semibold text-muted-foreground">{children}</p>;
}

const appear = (index: number) => ({
  initial: { opacity: 0, y: 10, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.35, ease: EASE_OUT, delay: Math.min(index, 10) * 0.035 },
});

function Chip({ children, selected, onClick, index }: { children: ReactNode; selected: boolean; onClick: () => void; index: number }) {
  return (
    <motion.button
      type="button"
      {...appear(index)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
        selected ? "border-primary bg-primary text-primary-foreground shadow-primary/25" : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      {children}
    </motion.button>
  );
}

function Tile({
  emoji,
  title,
  body,
  selected,
  onClick,
  index,
  large,
}: {
  emoji: string;
  title: string;
  body?: string;
  selected: boolean;
  onClick: () => void;
  index: number;
  large?: boolean;
}) {
  return (
    <motion.button
      type="button"
      {...appear(index)}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      aria-pressed={selected}
      className={`relative flex flex-col rounded-3xl border p-4 text-left shadow-sm transition-colors ${large ? "gap-2 p-5" : "items-center gap-1 text-center"} ${
        selected ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <span className={large ? "text-3xl" : "text-2xl"}>{emoji}</span>
      <span className={`font-semibold ${large ? "text-lg" : "text-sm"}`}>{title}</span>
      {body && <span className="text-sm text-muted-foreground">{body}</span>}
      <AnimatePresence>
        {selected && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={layoutSpring}
            className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground"
          >
            ✓
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function ReviewRow({ label, value, onClick, index }: { label: string; value: string; onClick: () => void; index: number }) {
  const { t } = useI18n();
  return (
    <motion.button
      type="button"
      {...appear(index)}
      onClick={onClick}
      className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-primary/5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-0.5 truncate font-medium ${value ? "" : "text-muted-foreground"}`}>{value || t("interview.notSet")}</p>
      </div>
      <span className="text-muted-foreground">›</span>
    </motion.button>
  );
}
