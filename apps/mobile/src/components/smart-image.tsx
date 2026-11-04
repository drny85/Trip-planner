import { cn, fallbackPhoto } from "@trip/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import { Image } from "./image";

type Props = {
  uri: string;
  /** Seed for the fallback photo, e.g. the activity id. */
  seed: string;
  className?: string;
  /** Shown on a tinted background while loading, or if every photo fails. */
  emoji?: string;
  tint?: string;
};

/**
 * Photo with a fallback chain: the stored URL, then a seeded picsum photo, then a
 * tinted placeholder. expo-image fades each photo in as it loads.
 */
export function SmartImage({ uri, seed, className, emoji = "📍", tint = "#0e7c66" }: Props) {
  const [attempt, setAttempt] = useState(0);
  const source = attempt === 0 ? uri : attempt === 1 ? fallbackPhoto(seed) : null;

  return (
    <View className={cn("overflow-hidden", className)} style={{ backgroundColor: `${tint}22` }}>
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-4xl opacity-60">{emoji}</Text>
      </View>
      {source && (
        <Image
          key={source}
          source={source}
          className="absolute inset-0"
          contentFit="cover"
          transition={350}
          onError={() => setAttempt((a) => a + 1)}
        />
      )}
    </View>
  );
}
