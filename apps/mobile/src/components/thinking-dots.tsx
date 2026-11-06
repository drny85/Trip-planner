import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { cn } from "@trip/ui";

const bounce = {
  "0%": { transform: [{ translateY: 0 }], opacity: 0.45 },
  "50%": { transform: [{ translateY: -3 }], opacity: 1 },
  "100%": { transform: [{ translateY: 0 }], opacity: 0.45 },
};

/** Three bouncing dots, the "AI is thinking" signal. `className` sets their color (e.g. bg-white). */
export function ThinkingDots({ className = "bg-foreground", size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const reduced = useReducedMotion();
  const dot = size === "sm" ? "h-1 w-1" : "h-1.5 w-1.5";
  return (
    <View className="flex-row items-center gap-[3px]" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          className={cn(dot, "rounded-full", className)}
          style={
            reduced
              ? { opacity: 0.4 + i * 0.3 }
              : { animationName: bounce, animationDuration: 900, animationDelay: i * 150, animationIterationCount: "infinite", animationTimingFunction: "ease-in-out" }
          }
        />
      ))}
    </View>
  );
}
