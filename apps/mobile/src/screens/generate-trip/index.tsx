import { localeNames } from "@trip/i18n";
import { PlanLimitNotice } from "@/components/billing";
import { useI18n } from "@trip/i18n/react";
import { api } from "@trip/backend/api";
import { appendAnswer, type ImproveQuestion, withTimeout } from "@trip/backend/promptAnswer";
import { useAction, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useCSSVariable } from "uniwind";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { enterUp } from "@/lib/motion";
import { TripInterview } from "./interview";
import { Planning } from "./planning";

const IDEAS = ["idea1", "idea2", "idea3", "idea4"] as const;

/** Plan with AI: the guided interview by default, with free text as a shortcut. */
export function GenerateTrip() {
  const [mode, setMode] = useState<"interview" | "text">("interview");
  const plan = useQuery(api.billing.status, {});
  // Decided once on arrival, so saving the free trip doesn't swap the planning screen for the notice.
  // The server checks again; this just saves answering for a trip that can't be planned.
  const [gate, setGate] = useState<{ blocked: "subscribe" | "tooManyUpcoming" | null; max: number } | undefined>();
  if (plan && gate === undefined) setGate({ blocked: plan.blocked, max: plan.maxUpcoming });
  if (gate?.blocked)
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="p-5">
        <PlanLimitNotice blocked={gate.blocked} max={gate.max} />
      </ScrollView>
    );
  return mode === "interview" ? <TripInterview onTypeInstead={() => setMode("text")} /> : <FreeText onUseInterview={() => setMode("interview")} />;
}

function FreeText({ onUseInterview }: { onUseInterview: () => void }) {
  const router = useRouter();
  const generate = useAction(api.ai.generateTrip);
  const improve = useAction(api.ai.improvePrompt);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localFocus, setLocalFocus] = useState(false);
  const primary = useCSSVariable("--color-primary");
  // "Improve with AI": the person's own text (for Undo), and the missing-detail questions.
  const [original, setOriginal] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ImproveQuestion[]>([]);
  const [improving, setImproving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { t, locale } = useI18n();
  const ready = prompt.trim().length >= 3;
  const improved = original !== null;

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const tripId = await generate({ prompt, language: locale, localFocus });
      router.dismissTo({ pathname: "/trips/[tripId]", params: { tripId } });
    } catch (e) {
      setError(e instanceof Error ? cleanError(e.message) : t("common.somethingWrong"));
    } finally {
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

  const busy = loading || improving;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-5 p-5" keyboardShouldPersistTaps="handled">
      {loading ? (
        <Planning />
      ) : (
        <Animated.View entering={enterUp(0)} className="gap-1">
          <Text className="text-3xl font-extrabold tracking-tight text-foreground">{t("generate.title")}</Text>
          <Text className="text-base text-muted-foreground">{t("generate.intro")}</Text>
        </Animated.View>
      )}

      <TextInput
        value={prompt}
        onChangeText={(text) => {
          setPrompt(text);
          setNotice(null);
          // Clearing the box ends the improved state.
          if (!text.trim()) {
            setOriginal(null);
            setQuestions([]);
          }
        }}
        multiline
        autoFocus
        editable={!busy}
        maxLength={2000}
        placeholder={t("generate.placeholder")}
        placeholderTextColorClassName="accent-muted-foreground"
        textAlignVertical="top"
        className={`min-h-36 rounded-3xl border bg-card p-5 text-lg text-foreground ${improved ? "border-primary/50" : "border-border"} ${improving ? "opacity-60" : ""}`}
      />

      {improved ? (
        <Animated.View entering={FadeIn.duration(250)} className="-mt-2 flex-row flex-wrap items-center gap-2">
          <Text className="text-sm text-primary">✨ {t("generate.improvedNote")}</Text>
          <PressableScale
            onPress={undo}
            disabled={busy}
            accessibilityRole="button"
            className="flex-row items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5"
          >
            <Icon name="undo" size={14} colorVar="--color-foreground" />
            <Text className="text-sm text-foreground">{t("generate.undo")}</Text>
          </PressableScale>
        </Animated.View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {IDEAS.map((idea, index) => (
            <Animated.View key={idea} entering={enterUp(index + 1)}>
              <PressableScale
                onPress={() => setPrompt(t(`generate.${idea}`))}
                disabled={busy}
                className="rounded-full border border-border bg-card px-3.5 py-2"
              >
                <Text className="text-sm text-foreground">{t(`generate.${idea}`)}</Text>
              </PressableScale>
            </Animated.View>
          ))}
        </View>
      )}

      {questions.length > 0 && !loading && (
        <Animated.View entering={enterUp(0)} layout={LinearTransition} className="gap-3 rounded-3xl border border-border bg-card p-4">
          <Text className="text-sm font-semibold text-foreground">{t("generate.questionsTitle")}</Text>
          {questions.map((q, index) => (
            <Animated.View key={q.question} exiting={FadeOut.duration(150)} layout={LinearTransition} className="gap-2">
              <Text className="text-sm text-muted-foreground">{q.question}</Text>
              <View className="flex-row flex-wrap gap-2">
                {q.options.map((o) => (
                  <PressableScale
                    key={o.label}
                    onPress={() => answer(index, o.addition)}
                    accessibilityRole="button"
                    accessibilityHint={o.addition}
                    className="rounded-full border border-border bg-background px-3 py-1.5"
                  >
                    <Text className="text-sm text-foreground">{o.label}</Text>
                  </PressableScale>
                ))}
              </View>
            </Animated.View>
          ))}
        </Animated.View>
      )}

      <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <Text className="text-2xl">💎</Text>
        <View className="flex-1">
          <Text className="font-semibold text-foreground">{t("local.hiddenGems")}</Text>
          <Text className="text-sm text-muted-foreground">{t("local.hiddenGemsHint")}</Text>
        </View>
        <Switch
          value={localFocus}
          onValueChange={setLocalFocus}
          disabled={loading}
          accessibilityLabel={t("local.hiddenGems")}
          trackColor={{ true: typeof primary === "string" ? primary : undefined }}
        />
      </View>

      {improved || loading ? (
        <Button icon="sparkles" loading={loading} disabled={!ready} onPress={submit}>
          {loading ? t("generate.planning") : t("generate.submit")}
        </Button>
      ) : (
        <View className="gap-3">
          {ready && !improving && <Text className="text-center text-sm text-muted-foreground">{t("generate.choose")}</Text>}
          <Button icon="sparkles" loading={improving} disabled={!ready} onPress={runImprove}>
            {improving ? t("generate.improving") : t("generate.improve")}
          </Button>
          <Button variant="secondary" disabled={!ready || improving} onPress={submit}>
            {t("generate.asIs")}
          </Button>
        </View>
      )}
      {!loading && <Text className="-mt-2 text-center text-xs text-muted-foreground">{t("generate.writtenIn", { language: localeNames[locale] })}</Text>}
      {notice && <Text className="rounded-2xl bg-muted p-3 text-center text-sm text-muted-foreground">{notice}</Text>}
      {error && <Text className="text-center text-danger">{error}</Text>}
      {!busy && (
        <PressableScale onPress={onUseInterview} accessibilityRole="button" className="items-center py-2">
          <Text className="text-sm font-semibold text-primary">{`💬 ${t("interview.useInterview")}`}</Text>
        </PressableScale>
      )}
    </ScrollView>
  );
}

/** Convex wraps server errors as "[CONVEX A(ai:generateTrip)] ... Uncaught Error: <message>". */
function cleanError(message: string) {
  return message.match(/Uncaught Error: (.*?)(\n|$)/)?.[1] ?? message;
}
