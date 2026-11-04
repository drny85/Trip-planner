import { api } from "@trip/backend/api";
import { useAction } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button } from "@/components/button";

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
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-5" keyboardShouldPersistTaps="handled">
      <View className="gap-1">
        <Text className="text-2xl font-bold text-foreground">Where to?</Text>
        <Text className="text-muted-foreground">
          Say where, how long, your budget and what you enjoy. You can edit everything afterwards.
        </Text>
      </View>

      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        multiline
        autoFocus
        editable={!loading}
        placeholder="e.g. 5 days in Tokyo on a moderate budget"
        placeholderTextColorClassName="accent-muted-foreground"
        textAlignVertical="top"
        className="min-h-32 rounded-2xl border border-border bg-card p-4 text-base text-foreground"
      />

      <View className="flex-row flex-wrap gap-2">
        {IDEAS.map((idea) => (
          <Pressable
            key={idea}
            onPress={() => setPrompt(idea)}
            disabled={loading}
            className="rounded-full bg-muted px-3 py-2 active:opacity-70"
          >
            <Text className="text-sm text-foreground">{idea}</Text>
          </Pressable>
        ))}
      </View>

      <Button icon="sparkles" loading={loading} disabled={prompt.trim().length < 3} onPress={submit}>
        {loading ? "Planning your trip…" : "Generate itinerary"}
      </Button>
      {loading && (
        <Text className="text-center text-sm text-muted-foreground">This usually takes under a minute.</Text>
      )}
      {error && <Text className="text-center text-danger">{error}</Text>}
    </ScrollView>
  );
}

/** Convex wraps server errors as "[CONVEX A(ai:generateTrip)] ... Uncaught Error: <message>". */
function cleanError(message: string) {
  return message.match(/Uncaught Error: (.*?)(\n|$)/)?.[1] ?? message;
}
