import { useI18n } from "@trip/i18n/react";
import {
  flightPoint,
  formatElapsed,
  PLANNING_FACT_EVERY,
  PLANNING_SLOW_AFTER,
  PLANNING_STAGES,
  PLANNING_STOPS,
  planningProgress,
  planningStage,
} from "@trip/ui";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, useColorScheme, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInRight,
  FadeOut,
  FadeOutLeft,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  ZoomIn,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "@/components/gradient";
import { Icon } from "@/components/icon";
import { ThinkingDots } from "@/components/thinking-dots";
import { EASE_OUT, enterUp } from "@/lib/motion";

/** One emoji per stage, shown on that stage's stop along the route. */
const STAGE_EMOJI = ["📝", "🏘️", "🍜", "⚖️", "📍"] as const;
const FACTS = [
  { key: "planning.fact1", emoji: "🏝️" },
  { key: "planning.fact2", emoji: "🗼" },
  { key: "planning.fact3", emoji: "✈️" },
  { key: "planning.fact4", emoji: "🦟" },
  { key: "planning.fact5", emoji: "🛶" },
  { key: "planning.fact6", emoji: "🏞️" },
  { key: "planning.fact7", emoji: "🚉" },
  { key: "planning.fact8", emoji: "🌳" },
  { key: "planning.fact9", emoji: "🏙️" },
  { key: "planning.fact10", emoji: "🥐" },
] as const;

/** The scene is 5:3, a little taller than on the web so the route fits a phone. */
const SCENE_ASPECT = 0.6;
/** SF Symbols' airplane points right; Material's flight icon points up. */
const PLANE_HEADING = Platform.OS === "ios" ? 0 : 90;
const PLANE_SIZE = 34;
/** Points sampled along the route, for the dotted trail and the plane's path. */
const SAMPLES = Array.from({ length: 41 }, (_, i) => i / 40);
const TRAIL = Array.from({ length: 26 }, (_, i) => i / 25);

/** Milliseconds since the component mounted, updated a few times a second. */
function useElapsed(every = 250) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - start), every);
    return () => clearInterval(id);
  }, [every]);
  return elapsed;
}

/**
 * Shown while the AI plans a trip, which can take close to a minute. A plane flies the
 * route at the pace of the progress bar and drops a stop for each stage, a checklist
 * shows what's happening, and a card serves travel facts to read while waiting.
 */
export function Planning({ prompt }: { prompt?: string }) {
  const { t } = useI18n();
  const elapsed = useElapsed();
  const stage = planningStage(elapsed);
  const progress = planningProgress(elapsed);

  // A light tap each time a new stage starts.
  const lastStage = useRef(stage);
  useEffect(() => {
    if (stage > lastStage.current) Haptics.selectionAsync().catch(() => {});
    lastStage.current = stage;
  }, [stage]);

  return (
    <Animated.View entering={FadeIn.duration(250)} className="gap-4">
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">{t("generate.eyebrow")}</Text>
          <Text className="text-3xl font-extrabold tracking-tight text-foreground">{t("planning.title")}</Text>
        </View>
        <View className="rounded-full border border-border bg-card px-3 py-1" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text className="text-sm text-muted-foreground" style={{ fontVariant: ["tabular-nums"] }}>
            {formatElapsed(elapsed)}
          </Text>
        </View>
      </View>

      <FlightScene progress={progress} stage={stage} status={t(`generate.${PLANNING_STAGES[stage]!.key}`)} />

      <Animated.View entering={enterUp(1)}>
        <StageList stage={stage} />
      </Animated.View>
      <Animated.View entering={enterUp(2)}>
        <FactCard />
      </Animated.View>
      {prompt?.trim() ? (
        <Animated.View entering={enterUp(3)} className="gap-1.5 rounded-3xl border border-border bg-card p-4">
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("planning.yourRequest")}</Text>
          <Text numberOfLines={4} className="text-sm text-foreground">
            “{prompt}”
          </Text>
        </Animated.View>
      ) : null}

      <Animated.Text key={elapsed > PLANNING_SLOW_AFTER ? "slow" : "usual"} entering={FadeIn.duration(300)} className="text-center text-sm text-muted-foreground">
        {elapsed > PLANNING_SLOW_AFTER ? t("planning.slow") : t("generate.usuallyTakes")}
      </Animated.Text>
    </Animated.View>
  );
}

/** The sky card: drifting clouds, a glowing sun, and the plane flying the dotted route. */
function FlightScene({ progress, stage, status }: { progress: number; stage: number; status: string }) {
  const dark = useColorScheme() === "dark";
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const height = width * SCENE_ASPECT;

  // Eases between the ticks so the plane glides instead of hopping.
  const flown = useSharedValue(0);
  useEffect(() => {
    flown.value = withTiming(progress, { duration: 400, easing: Easing.linear });
  }, [flown, progress]);

  const progressStyle = useAnimatedStyle(() => ({ width: `${flown.value * 100}%` }));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className="overflow-hidden rounded-3xl"
      style={{ aspectRatio: 1 / SCENE_ASPECT, borderCurve: "continuous" }}
    >
      <LinearGradient
        colors={dark ? ["#064e3b", "#0b6b58", "#0c4a6e"] : ["#0e7c66", "#10b981", "#0ea5e9"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />

      {/* Sun */}
      <Animated.View
        className="absolute rounded-full bg-amber-300"
        style={[
          { right: "9%", top: "12%", width: height * 0.18, height: height * 0.18, boxShadow: "0 0 40px 14px rgba(252,211,77,0.45)" },
          reduced
            ? null
            : {
                animationName: { "0%": { transform: [{ scale: 1 }] }, "50%": { transform: [{ scale: 1.08 }] }, "100%": { transform: [{ scale: 1 }] } },
                animationDuration: 3200,
                animationIterationCount: "infinite",
                animationTimingFunction: "ease-in-out",
              },
        ]}
      />

      {width > 0 && !reduced
        ? [
            { top: 0.14, scale: 0.7, duration: 34_000, delay: -6_000, opacity: 0.5 },
            { top: 0.46, scale: 1, duration: 24_000, delay: -16_000, opacity: 0.75 },
            { top: 0.7, scale: 1.2, duration: 18_000, delay: -3_000, opacity: 0.9 },
          ].map((c) => (
            <Animated.View
              key={c.top}
              className="absolute left-0"
              style={{
                top: height * c.top,
                opacity: c.opacity,
                animationName: {
                  from: { transform: [{ translateX: width + 20 }, { scale: c.scale }] },
                  to: { transform: [{ translateX: -120 }, { scale: c.scale }] },
                },
                animationDuration: c.duration,
                animationDelay: c.delay,
                animationIterationCount: "infinite",
                animationTimingFunction: "linear",
              }}
            >
              <Cloud />
            </Animated.View>
          ))
        : null}

      {width > 0 ? (
        <>
          {TRAIL.map((at) => (
            <TrailDot key={at} at={at} flown={flown} width={width} height={height} />
          ))}
          <Marker at={1} width={width} height={height}>
            <Text className="text-xl opacity-70">🏁</Text>
          </Marker>
          {PLANNING_STOPS.map((at, i) =>
            i <= stage ? (
              <Marker key={i} at={at} width={width} height={height}>
                <Animated.View entering={reduced ? FadeIn : ZoomIn.springify().damping(11)} className="h-8 w-8 items-center justify-center rounded-full bg-white" style={{ boxShadow: "0 4px 10px rgba(0,0,0,0.2)" }}>
                  {i === stage && !reduced ? (
                    <Animated.View
                      className="absolute inset-0 rounded-full border-2 border-white"
                      style={{
                        animationName: { from: { transform: [{ scale: 1 }], opacity: 0.8 }, to: { transform: [{ scale: 1.9 }], opacity: 0 } },
                        animationDuration: 1600,
                        animationIterationCount: "infinite",
                        animationTimingFunction: "ease-out",
                      }}
                    />
                  ) : null}
                  <Text className="text-base">{STAGE_EMOJI[i]}</Text>
                </Animated.View>
              </Marker>
            ) : null,
          )}
          <Plane flown={flown} width={width} height={height} bob={!reduced} />
        </>
      ) : null}

      {/* What's happening now */}
      <View className="absolute inset-x-0 bottom-0 items-center p-3">
        <View
          accessibilityRole="progressbar"
          accessibilityLiveRegion="polite"
          accessibilityLabel={status}
          className="max-w-full flex-row items-center gap-2.5 rounded-full border border-white/25 bg-black/25 px-4 py-2"
        >
          <ThinkingDots className="bg-white" />
          <Animated.Text key={status} entering={FadeIn.duration(300)} exiting={FadeOut.duration(150)} numberOfLines={1} className="text-sm font-semibold text-white">
            {status}
          </Animated.Text>
        </View>
      </View>

      <View className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
        <Animated.View className="h-full bg-white" style={progressStyle} />
      </View>
    </View>
  );
}

/** Centers its children on the route, `at` of the way along (0..1). */
function Marker({ at, width, height, children }: { at: number; width: number; height: number; children: React.ReactNode }) {
  const p = flightPoint(at, SCENE_ASPECT);
  return (
    <View
      pointerEvents="none"
      className="absolute items-center justify-center"
      style={{ left: (p.x / 100) * width - 20, top: (p.y / 100) * height - 20, width: 40, height: 40 }}
    >
      {children}
    </View>
  );
}

/** One dot of the route; it brightens once the plane has passed it. */
function TrailDot({ at, flown, width, height }: { at: number; flown: SharedValue<number>; width: number; height: number }) {
  const p = flightPoint(at, SCENE_ASPECT);
  const style = useAnimatedStyle(() => {
    const passed = flown.value >= at;
    return { opacity: passed ? 1 : 0.35, transform: [{ scale: passed ? 1.25 : 1 }] };
  });
  return <Animated.View className="absolute h-1.5 w-1.5 rounded-full bg-white" style={[{ left: (p.x / 100) * width - 3, top: (p.y / 100) * height - 3 }, style]} />;
}

function Plane({ flown, width, height, bob }: { flown: SharedValue<number>; width: number; height: number; bob: boolean }) {
  const path = useMemo(() => {
    const points = SAMPLES.map((s) => flightPoint(s, SCENE_ASPECT));
    return {
      x: points.map((p) => (p.x / 100) * width - PLANE_SIZE / 2),
      y: points.map((p) => (p.y / 100) * height - PLANE_SIZE / 2),
      angle: points.map((p) => p.angle + PLANE_HEADING),
    };
  }, [width, height]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(flown.value, SAMPLES, path.x) },
      { translateY: interpolate(flown.value, SAMPLES, path.y) },
      { rotate: `${interpolate(flown.value, SAMPLES, path.angle)}deg` },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" className="absolute left-0 top-0 items-center justify-center" style={[{ width: PLANE_SIZE, height: PLANE_SIZE }, style]}>
      <Animated.View
        style={
          bob
            ? {
                animationName: { "0%": { transform: [{ translateY: -2 }] }, "50%": { transform: [{ translateY: 2 }] }, "100%": { transform: [{ translateY: -2 }] } },
                animationDuration: 1800,
                animationIterationCount: "infinite",
                animationTimingFunction: "ease-in-out",
              }
            : undefined
        }
      >
        <Icon name="plane" size={PLANE_SIZE - 4} colorVar="--color-on-image" />
      </Animated.View>
    </Animated.View>
  );
}

/** A cloud from three overlapping circles on a flat base. */
function Cloud() {
  return (
    <View className="h-10 w-24">
      <View className="absolute bottom-0 left-2 h-6 w-20 rounded-full bg-white" />
      <View className="absolute bottom-2 left-5 h-8 w-8 rounded-full bg-white" />
      <View className="absolute bottom-2 left-10 h-10 w-10 rounded-full bg-white" />
    </View>
  );
}

/** The five stages as a checklist: done, in progress, still to come. */
function StageList({ stage }: { stage: number }) {
  const { t } = useI18n();
  return (
    <View className="gap-0.5 rounded-3xl border border-border bg-card p-2" style={{ borderCurve: "continuous" }}>
      {PLANNING_STAGES.map((s, i) => {
        const state = i < stage ? "done" : i === stage ? "active" : "todo";
        return (
          <View key={s.key} className={`flex-row items-center gap-3 rounded-2xl px-2 py-2 ${state === "active" ? "bg-primary/10" : ""}`}>
            <View
              className={`h-7 w-7 items-center justify-center rounded-full border-2 ${
                state === "done" ? "border-success bg-success" : state === "active" ? "border-primary" : "border-border"
              }`}
            >
              {state === "done" ? (
                <Animated.View entering={ZoomIn.duration(200).easing(EASE_OUT)}>
                  <Icon name="check" size={13} colorVar="--color-card" />
                </Animated.View>
              ) : state === "active" ? (
                <ThinkingDots className="bg-primary" size="sm" />
              ) : (
                <Text className="text-xs font-bold text-muted-foreground">{i + 1}</Text>
              )}
            </View>
            <Text
              className={`flex-1 text-sm ${state === "active" ? "font-semibold text-foreground" : state === "done" ? "text-muted-foreground" : "text-muted-foreground opacity-70"}`}
            >
              {t(`generate.${s.key}`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** "While you wait": a travel fact that changes every few seconds. */
function FactCard() {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    // Start somewhere random (after mount, so server and client render the same first fact).
    const first = setTimeout(() => setIndex(Math.floor(Math.random() * FACTS.length)), 0);
    const id = setInterval(() => setIndex((i) => (i + 1) % FACTS.length), PLANNING_FACT_EVERY);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const fact = FACTS[index]!;

  return (
    <View className="gap-3 overflow-hidden rounded-3xl border border-border bg-card p-4" style={{ borderCurve: "continuous" }}>
      <Text className="text-xs font-semibold uppercase tracking-wider text-primary">💡 {t("planning.whileYouWait")}</Text>
      <View className="min-h-16">
        <Animated.View key={index} entering={FadeInRight.duration(300).easing(EASE_OUT)} exiting={FadeOutLeft.duration(200)} className="flex-row items-start gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-muted">
            <Text className="text-xl">{fact.emoji}</Text>
          </View>
          <Text className="flex-1 text-sm font-medium leading-5 text-foreground">{t(fact.key)}</Text>
        </Animated.View>
      </View>
      <View className="flex-row gap-1" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {FACTS.map((f, i) => (
          <View key={f.key} className={`h-1 rounded-full ${i === index ? "w-4 bg-primary" : "w-1 bg-border"}`} />
        ))}
      </View>
    </View>
  );
}
