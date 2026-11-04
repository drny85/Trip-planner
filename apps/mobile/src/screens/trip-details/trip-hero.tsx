import type { TripDetails } from "@trip/backend/types";
import { formatDateRange, tripLength } from "@trip/ui";
import { Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "@/components/gradient";
import { Icon } from "@/components/icon";
import { SmartImage } from "@/components/smart-image";
import { CSS_EASE_OUT } from "@/lib/motion";

export const HERO_HEIGHT = 420;

export function TripHero({ trip, scrollY }: { trip: TripDetails; scrollY: SharedValue<number> }) {
  const reduced = useReducedMotion();
  const { completed, total } = trip.progress;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const days = tripLength(trip.startDate, trip.endDate);

  // Parallax: the photo moves at half speed on scroll and stretches when pulled down.
  const photoStyle = useAnimatedStyle(() => {
    if (reduced) return {};
    const y = scrollY.get();
    return {
      transform: [
        { translateY: interpolate(y, [-HERO_HEIGHT, 0, HERO_HEIGHT], [-HERO_HEIGHT / 2, 0, HERO_HEIGHT * 0.5]) },
        { scale: interpolate(y, [-HERO_HEIGHT, 0], [2, 1], Extrapolation.CLAMP) },
      ],
    };
  });
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [0, HERO_HEIGHT * 0.5], [1, 0], Extrapolation.CLAMP),
    transform: reduced ? [] : [{ translateY: interpolate(scrollY.get(), [0, HERO_HEIGHT], [0, -40], Extrapolation.CLAMP) }],
  }));

  return (
    <View>
      <View className="overflow-hidden" style={{ height: HERO_HEIGHT }}>
        <Animated.View className="absolute inset-0" style={photoStyle}>
          <SmartImage uri={trip.imageUrl} seed={trip._id} className="absolute inset-0" emoji="✈️" />
        </Animated.View>
        <LinearGradient
          colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)", "rgba(0,0,0,0.8)"]}
          locations={[0, 0.35, 1]}
          className="absolute inset-0"
        />
        <Animated.View className="absolute inset-x-0 bottom-0 gap-2 px-5 pb-12" style={titleStyle}>
          {trip.isAIGenerated && (
            <View className="flex-row items-center gap-1.5 self-start rounded-full bg-white/20 px-3 py-1">
              <Icon name="sparkles" size={12} colorVar="--color-accent" />
              <Text className="text-xs font-semibold text-white">AI generated</Text>
            </View>
          )}
          <Text className="text-5xl font-extrabold tracking-tight text-white">{trip.title}</Text>
          <Text className="text-base text-white/85">
            {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
          </Text>
        </Animated.View>
      </View>

      <View className="mx-4 -mt-8 gap-4 rounded-3xl bg-card p-5 shadow-lg shadow-black/10">
        <View className="flex-row">
          <Stat value={`${days}`} label={days === 1 ? "day" : "days"} />
          <Stat value={`${total}`} label="activities" />
          <Stat value={`${percent}%`} label="done" highlight />
        </View>
        <View className="h-2 overflow-hidden rounded-full bg-muted">
          {/* Absolutely positioned, childless fill: animating width is cheap here. */}
          <Animated.View
            className="absolute bottom-0 left-0 top-0 rounded-full bg-primary"
            style={{
              width: `${percent}%`,
              transitionProperty: "width",
              transitionDuration: 450,
              transitionTimingFunction: CSS_EASE_OUT,
            }}
          />
        </View>
        {trip.description ? <Text className="leading-5 text-muted-foreground">{trip.description}</Text> : null}
      </View>
    </View>
  );
}

function Stat({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text className={highlight ? "text-2xl font-extrabold text-primary" : "text-2xl font-extrabold text-foreground"}>
        {value}
      </Text>
      <Text className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</Text>
    </View>
  );
}
