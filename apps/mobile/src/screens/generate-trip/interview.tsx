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
import { cn } from "@trip/ui";
import { useAction } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { type ComponentRef, type ReactNode, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInLeft, FadeInRight, FadeOut, ZoomIn } from "react-native-reanimated";
import { Button } from "@/components/button";
import { PressableScale } from "@/components/pressable-scale";
import { CSS_EASE_OUT, EASE_OUT, enterUp } from "@/lib/motion";
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

const tap = () => {
  Haptics.selectionAsync().catch(() => {});
};

/**
 * The default way to plan on the phone: five short, skippable, tap-to-answer
 * steps, then a review. The answers go to the planner as exact rules.
 */
export function TripInterview({ onTypeInstead }: { onTypeInstead: () => void }) {
  const router = useRouter();
  const generate = useAction(api.ai.generateTrip);
  const { t, f, locale } = useI18n();
  const [answers, setAnswers] = useState<TripPreferences>({ destination: "", interests: [] });
  const [step, setStep] = useState<Step>("where");
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const months = useMemo(() => upcomingMonths(6), []);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const text = { t: t as (key: string, vars?: Record<string, string | number>) => string, month: f.month };

  const index = ORDER.indexOf(step);
  const go = (to: Step) => {
    setDirection(ORDER.indexOf(to) >= index ? 1 : -1);
    setStep(to);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };
  const next = () => go(ORDER[Math.min(index + 1, ORDER.length - 1)]!);
  const back = () => go(ORDER[Math.max(index - 1, 0)]!);
  const set = <K extends keyof TripPreferences>(key: K, value: TripPreferences[K]) => setAnswers((a) => ({ ...a, [key]: value }));
  const toggle = <K extends "days" | "month" | "travelers" | "budget" | "pace">(key: K, value: NonNullable<TripPreferences[K]>) => {
    tap();
    setAnswers((a) => ({ ...a, [key]: a[key] === value ? undefined : value }));
  };
  const toggleInterest = (i: Interest) => {
    tap();
    setAnswers((a) => ({ ...a, interests: a.interests?.includes(i) ? a.interests.filter((x) => x !== i) : [...(a.interests ?? []), i] }));
  };
  const hasDestination = answers.destination.trim().length >= 2;

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const tripId = await generate({ prompt: summaryPrompt(answers, text), language: locale, preferences: answers });
      router.dismissTo({ pathname: "/trips/[tripId]", params: { tripId } });
    } catch (e) {
      setError(e instanceof Error ? (e.message.match(/Uncaught Error: (.*?)(\n|$)/)?.[1] ?? e.message) : t("common.somethingWrong"));
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-5 p-5">
        <Planning prompt={summaryParts(answers, text).join(" · ")} />
      </ScrollView>
    );
  }

  const entering = (direction > 0 ? FadeInRight : FadeInLeft).duration(280).easing(EASE_OUT);

  return (
    <ScrollView
      ref={scroll}
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-5 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-1 flex-row gap-1.5">
          {INTERVIEW_STEPS.map((s, i) => (
            <View key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
              <Animated.View
                className="h-full rounded-full bg-primary"
                style={{
                  width: i < index || step === "review" ? "100%" : i === index ? "50%" : "0%",
                  transitionProperty: "width",
                  transitionDuration: 450,
                  transitionTimingFunction: CSS_EASE_OUT,
                }}
              />
            </View>
          ))}
        </View>
        <Text className="text-xs text-muted-foreground">
          {step === "review" ? "✓" : t("interview.stepOf", { current: index + 1, total: INTERVIEW_STEPS.length })}
        </Text>
      </View>

      <Animated.View key={step} entering={entering} exiting={FadeOut.duration(120)} className="gap-5">
        {step === "where" && (
          <>
            <Title>{t("interview.whereTitle")}</Title>
            <TextInput
              value={answers.destination}
              onChangeText={(v) => set("destination", v)}
              onSubmitEditing={() => hasDestination && next()}
              returnKeyType="next"
              autoFocus
              maxLength={200}
              placeholder={t("interview.wherePlaceholder")}
              placeholderTextColorClassName="accent-muted-foreground"
              className="rounded-3xl border border-border bg-card px-5 py-4 text-2xl font-semibold text-foreground"
            />
            <Label>{t("interview.popular")}</Label>
            <Chips>
              {POPULAR.map((p, i) => (
                <Chip
                  key={p.name}
                  index={i}
                  selected={answers.destination === p.name}
                  onPress={() => {
                    tap();
                    set("destination", p.name);
                  }}
                >
                  {`${p.emoji} ${p.name}`}
                </Chip>
              ))}
            </Chips>
          </>
        )}

        {step === "when" && (
          <>
            <Title>{t("interview.whenTitle")}</Title>
            <Label>{t("interview.lengthLabel")}</Label>
            <Chips>
              {TRIP_LENGTHS.map((d, i) => (
                <Chip key={d} index={i} selected={answers.days === d} onPress={() => toggle("days", d)}>
                  {t("interview.days", { count: d })}
                </Chip>
              ))}
            </Chips>
            <Label>{t("interview.monthLabel")}</Label>
            <Chips>
              {months.map((m, i) => (
                <Chip key={m} index={i} selected={answers.month === m} onPress={() => toggle("month", m)}>
                  {f.month(m)}
                </Chip>
              ))}
              <Chip
                index={months.length}
                selected={!answers.month}
                onPress={() => {
                  tap();
                  set("month", undefined);
                }}
              >
                {`🗓️ ${t("interview.flexible")}`}
              </Chip>
            </Chips>
          </>
        )}

        {step === "who" && (
          <>
            <Title>{t("interview.whoTitle")}</Title>
            <Label>{t("interview.whoLabel")}</Label>
            <View className="flex-row flex-wrap gap-3">
              {TRAVELERS.map((v, i) => (
                <Tile key={v} index={i} half selected={answers.travelers === v} onPress={() => toggle("travelers", v)} emoji={TRAVELER_EMOJI[v]} title={t(`interview.${v}`)} />
              ))}
            </View>
            <Label>{t("interview.budgetLabel")}</Label>
            <View className="flex-row gap-3">
              {BUDGETS.map((v, i) => (
                <Tile key={v} index={i + 4} selected={answers.budget === v} onPress={() => toggle("budget", v)} emoji={BUDGET_EMOJI[v]} title={t(`interview.${v}`)} />
              ))}
            </View>
          </>
        )}

        {step === "pace" && (
          <>
            <Title sub={t("interview.paceIntro")}>{t("interview.paceTitle")}</Title>
            <View className="gap-3">
              {PACES.map((v, i) => (
                <Tile
                  key={v}
                  index={i}
                  wide
                  selected={answers.pace === v}
                  onPress={() => {
                    toggle("pace", v);
                    // One question on this step: move on after the tap registers.
                    if (answers.pace !== v) setTimeout(() => go("interests"), 320);
                  }}
                  emoji={PACE_EMOJI[v]}
                  title={t(`interview.${v}`)}
                  body={t(`interview.${v}Body`)}
                />
              ))}
            </View>
          </>
        )}

        {step === "interests" && (
          <>
            <Title sub={t("interview.interestsIntro")}>{t("interview.interestsTitle")}</Title>
            <Chips>
              {INTERESTS.map((v, i) => (
                <Chip key={v} index={i} selected={!!answers.interests?.includes(v)} onPress={() => toggleInterest(v)}>
                  {`${INTEREST_EMOJI[v]} ${t(`interview.${v}`)}`}
                </Chip>
              ))}
            </Chips>
            <Label>{t("interview.notesLabel")}</Label>
            <TextInput
              value={answers.notes ?? ""}
              onChangeText={(v) => set("notes", v)}
              multiline
              maxLength={800}
              placeholder={t("interview.notesPlaceholder")}
              placeholderTextColorClassName="accent-muted-foreground"
              textAlignVertical="top"
              className="min-h-24 rounded-3xl border border-border bg-card p-4 text-base text-foreground"
            />
          </>
        )}

        {step === "review" && (
          <>
            <Title sub={t("interview.reviewIntro")}>{t("interview.reviewTitle")}</Title>
            <View className="overflow-hidden rounded-3xl border border-border bg-card">
              <ReviewRow index={0} label={t("interview.destinationLabel")} value={answers.destination} onPress={() => go("where")} />
              <ReviewRow
                index={1}
                label={t("interview.whenLabel")}
                value={[answers.days && t("interview.days", { count: answers.days }), answers.month ? f.month(answers.month) : t("interview.flexible")].filter(Boolean).join(" · ")}
                onPress={() => go("when")}
              />
              <ReviewRow
                index={2}
                label={t("interview.whoBudgetLabel")}
                value={[answers.travelers && `${TRAVELER_EMOJI[answers.travelers]} ${t(`interview.${answers.travelers}`)}`, answers.budget && t(`interview.${answers.budget}`)].filter(Boolean).join(" · ")}
                onPress={() => go("who")}
              />
              <ReviewRow
                index={3}
                label={t("interview.paceLabel")}
                value={answers.pace ? `${PACE_EMOJI[answers.pace]} ${t(`interview.${answers.pace}`)}` : ""}
                onPress={() => go("pace")}
              />
              <ReviewRow
                index={4}
                last
                label={t("interview.interestsLabel")}
                value={[answers.interests?.map((i) => `${INTEREST_EMOJI[i]} ${t(`interview.${i}`)}`).join("  "), answers.notes].filter(Boolean).join(" · ")}
                onPress={() => go("interests")}
              />
            </View>
          </>
        )}
      </Animated.View>

      {step === "review" ? (
        <View className="gap-2">
          <Button icon="sparkles" onPress={submit}>
            {t("generate.submit")}
          </Button>
          <Button variant="ghost" onPress={back}>
            {`← ${t("interview.back")}`}
          </Button>
        </View>
      ) : (
        <View className="flex-row items-center gap-2">
          {index > 0 && (
            <Button variant="ghost" onPress={back}>
              {`← ${t("interview.back")}`}
            </Button>
          )}
          <View className="flex-1" />
          {step !== "where" && (
            <Button variant="ghost" onPress={next}>
              {t("interview.skip")}
            </Button>
          )}
          <Button disabled={!hasDestination} onPress={next}>
            {`${t("interview.next")} →`}
          </Button>
        </View>
      )}

      <Text className="text-center text-xs text-muted-foreground">{t("generate.writtenIn", { language: localeNames[locale] })}</Text>
      {error && <Text className="text-center text-danger">{error}</Text>}
      <PressableScale onPress={onTypeInstead} accessibilityRole="button" className="items-center py-2">
        <Text className="text-sm font-semibold text-primary">{`✍️ ${t("interview.typeInstead")}`}</Text>
      </PressableScale>
    </ScrollView>
  );
}

function Title({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <View className="gap-1">
      <Text className="text-3xl font-extrabold tracking-tight text-foreground">{children}</Text>
      {sub && <Text className="text-base text-muted-foreground">{sub}</Text>}
    </View>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <Text className="-mb-2 text-sm font-semibold text-muted-foreground">{children}</Text>;
}

function Chips({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}

function Chip({ children, selected, onPress, index }: { children: string; selected: boolean; onPress: () => void; index: number }) {
  return (
    <Animated.View entering={enterUp(index)}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        className={cn("rounded-full border px-4 py-2", selected ? "border-primary bg-primary" : "border-border bg-card")}
      >
        <Text className={cn("text-sm font-medium", selected ? "text-primary-foreground" : "text-foreground")}>{children}</Text>
      </PressableScale>
    </Animated.View>
  );
}

function Tile({
  emoji,
  title,
  body,
  selected,
  onPress,
  index,
  wide,
  half,
}: {
  emoji: string;
  title: string;
  body?: string;
  selected: boolean;
  onPress: () => void;
  index: number;
  wide?: boolean;
  half?: boolean;
}) {
  return (
    <Animated.View entering={enterUp(index)} className={wide ? "w-full" : half ? "w-[47%] grow" : "flex-1"}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        className={cn(
          "rounded-3xl border p-4",
          wide ? "flex-row items-center gap-4" : "items-center gap-1",
          selected ? "border-primary bg-primary/10" : "border-border bg-card",
        )}
      >
        <Text className={wide ? "text-3xl" : "text-2xl"}>{emoji}</Text>
        <View className={wide ? "flex-1 gap-0.5" : "items-center"}>
          <Text className={cn("font-semibold text-foreground", wide ? "text-lg" : "text-center text-sm")}>{title}</Text>
          {body && <Text className="text-sm text-muted-foreground">{body}</Text>}
        </View>
        {selected && (
          <Animated.View entering={ZoomIn.duration(180)} className={cn("h-6 w-6 items-center justify-center rounded-full bg-primary", !wide && "absolute right-2 top-2")}>
            <Text className="text-xs font-bold text-primary-foreground">✓</Text>
          </Animated.View>
        )}
      </PressableScale>
    </Animated.View>
  );
}

function ReviewRow({ label, value, onPress, index, last }: { label: string; value: string; onPress: () => void; index: number; last?: boolean }) {
  const { t } = useI18n();
  return (
    <Animated.View entering={FadeIn.duration(250).delay(index * 40)}>
      <PressableScale onPress={onPress} pressedScale={0.99} accessibilityRole="button" className={cn("flex-row items-center gap-3 px-5 py-4", !last && "border-b border-border")}>
        <View className="flex-1 gap-0.5">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</Text>
          <Text numberOfLines={2} className={cn("text-base font-medium", value ? "text-foreground" : "text-muted-foreground")}>
            {value || t("interview.notSet")}
          </Text>
        </View>
        <Text className="text-lg text-muted-foreground">›</Text>
      </PressableScale>
    </Animated.View>
  );
}
