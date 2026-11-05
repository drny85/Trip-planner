import { api } from "@trip/backend/api";
import { useAction } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { enterUp } from "@/lib/motion";

const STATUS = [
  "Reading your request…",
  "Finding the best neighborhoods…",
  "Picking places to eat…",
  "Lining up the sights…",
  "Balancing each day…",
  "Adding booking links…",
];

const IDEAS = [
  "5 days in Tokyo on a moderate budget, love food and temples",
  "A relaxed long weekend in Lisbon with great seafood",
  "4 days in Mexico City for art lovers",
  "A week road-tripping the Amalfi Coast",
];

export function GenerateTrip() {
  const router = useRouter();
  const generate = useAction(api.ai.generateTrip);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const tripId = await generate({ prompt });
      router.dismissTo({ pathname: "/trips/[tripId]", params: { tripId } });
    } catch (e) {
      setError(e instanceof Error ? cleanError(e.message) : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-5 p-5" keyboardShouldPersistTaps="handled">
      {loading ? (
        <Planning />
      ) : (
        <Animated.View entering={enterUp(0)} className="gap-1">
          <Text className="text-3xl font-extrabold tracking-tight text-foreground">Where to?</Text>
          <Text className="text-base text-muted-foreground">
            Say where, how long, your budget and what you enjoy. You can edit everything afterwards.
          </Text>
        </Animated.View>
      )}

      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        multiline
        autoFocus
        editable={!loading}
        placeholder="e.g. 5 days in Tokyo on a moderate budget"
        placeholderTextColorClassName="accent-muted-foreground"
        textAlignVertical="top"
        className="min-h-36 rounded-3xl border border-border bg-card p-5 text-lg text-foreground"
      />

      <View className="flex-row flex-wrap gap-2">
        {IDEAS.map((idea, index) => (
          <Animated.View key={idea} entering={enterUp(index + 1)}>
            <PressableScale
              onPress={() => setPrompt(idea)}
              disabled={loading}
              className="rounded-full border border-border bg-card px-3.5 py-2"
            >
              <Text className="text-sm text-foreground">{idea}</Text>
            </PressableScale>
          </Animated.View>
        ))}
      </View>

      <Button icon="sparkles" loading={loading} disabled={prompt.trim().length < 3} onPress={submit}>
        {loading ? "Planning your trip…" : "Generate itinerary"}
      </Button>
      {error && <Text className="text-center text-danger">{error}</Text>}
    </ScrollView>
  );
}

/** Shown while Claude plans: a breathing orb and rotating status lines. */
function Planning() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % STATUS.length), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <Animated.View entering={FadeIn.duration(250)} className="items-center gap-5 py-6">
      <View className="h-28 w-28 items-center justify-center">
        <Animated.View
          className="absolute h-28 w-28 rounded-full bg-primary/20"
          style={{
            animationName: { from: { transform: [{ scale: 0.85 }], opacity: 0.9 }, to: { transform: [{ scale: 1.15 }], opacity: 0.3 } },
            animationDuration: 1400,
            animationIterationCount: "infinite",
            animationDirection: "alternate",
            animationTimingFunction: "ease-in-out",
          }}
        />
        <View className="h-16 w-16 items-center justify-center rounded-full bg-primary">
          <Icon name="sparkles" size={28} colorVar="--color-primary-foreground" />
        </View>
      </View>
      <Animated.Text
        key={step}
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
        className="text-lg font-semibold text-foreground"
      >
        {STATUS[step]}
      </Animated.Text>
      <Text className="text-sm text-muted-foreground">This usually takes under a minute.</Text>
    </Animated.View>
  );
}

/** Convex wraps server errors as "[CONVEX A(ai:generateTrip)] ... Uncaught Error: <message>". */
function cleanError(message: string) {
  return message.match(/Uncaught Error: (.*?)(\n|$)/)?.[1] ?? message;
}
