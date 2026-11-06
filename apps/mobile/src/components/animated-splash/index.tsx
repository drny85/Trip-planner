import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, useColorScheme } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { launchSystemScheme } from "@/lib/theme";
import { geometry } from "./geometry";

// Keep the native splash up until the animated one has drawn its first frame,
// so the hand-off is invisible. Called at module scope, as the docs advise.
if (Platform.OS !== "web") SplashScreen.preventAutoHideAsync();

/** Points wide. app.config.ts gives the native splash the same imageWidth, so they line up. */
export const SPLASH_SIZE = 240;
const unit = SPLASH_SIZE / 1024;

const art = {
  pinLight: require("../../../assets/images/splash/pin-light.png"),
  pinDark: require("../../../assets/images/splash/pin-dark.png"),
  sun: require("../../../assets/images/splash/sun.png"),
  sparkle: require("../../../assets/images/splash/sparkle.png"),
};

/** When each beat starts, in ms after the native splash hides. */
const beat = { glow: 60, route: 180, hop: 380, sparkle: 760, title: 620, exit: 1550 };
const ease = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * The animated splash. It starts as an exact copy of the native splash (same color,
 * same pin and sun, same size and place), then the sun glows, the flight path draws
 * itself around the pin, the pin hops, the AI sparkle lands and the name fades in.
 * Finally it zooms gently and fades to reveal the app, which has been loading underneath.
 * With Reduce Motion on, it just fades.
 */
export function AnimatedSplash() {
  // The native splash follows the phone's setting; the app may use a different theme.
  // Start in the native look and cross-fade to the app's, so the hand-off doesn't jump.
  const nativeDark = launchSystemScheme === "dark";
  const dark = useColorScheme() === "dark";
  const switchTheme = nativeDark !== dark;
  const reduced = useReducedMotion();
  const [done, setDone] = useState(Platform.OS === "web");

  const glow = useSharedValue(0);
  const sunScale = useSharedValue(1);
  const route = useSharedValue(0);
  const hop = useSharedValue(0);
  const spark = useSharedValue(0);
  const title = useSharedValue(0);
  const exit = useSharedValue(0);
  const themed = useSharedValue(0);

  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    const finish = () => setDone(true);
    const out = (delay: number, duration: number) =>
      withDelay(delay, withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }, (ok) => {
        if (ok) scheduleOnRN(finish);
      }));

    if (switchTheme) themed.value = withTiming(1, { duration: reduced ? 200 : 420, easing: Easing.inOut(Easing.quad) });
    if (reduced) {
      exit.value = out(350, 260);
      return;
    }
    glow.value = withDelay(beat.glow, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    sunScale.value = withDelay(beat.glow, withSequence(withTiming(1.14, { duration: 260, easing: ease }), withSpring(1, { damping: 9, stiffness: 160 })));
    route.value = withDelay(beat.route, withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) }));
    hop.value = withDelay(beat.hop, withSequence(withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 7, stiffness: 220 })));
    spark.value = withDelay(beat.sparkle, withSpring(1, { damping: 8, stiffness: 180 }));
    title.value = withDelay(beat.title, withTiming(1, { duration: 520, easing: ease }));
    exit.value = out(beat.exit, 460);
  }, [started, reduced, switchTheme, glow, sunScale, route, hop, spark, title, exit, themed]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const themedStyle = useAnimatedStyle(() => ({ opacity: themed.value }));
  const stageStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + exit.value * 0.28 }] }));
  const pinStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -hop.value * 16 },
      // A little squash at the bottom of the hop, stretch at the top.
      { scaleY: 1 + hop.value * 0.04 },
    ],
  }));
  const sunStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -hop.value * 16 }, { scale: sunScale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 0.15, 1], [0, 0.55, 0]),
    transform: [{ translateY: -hop.value * 16 }, { scale: 1 + glow.value * 1.4 }],
  }));
  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: Math.min(spark.value * 1.5, 1),
    transform: [{ scale: spark.value }, { rotate: `${(1 - spark.value) * -90}deg` }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: title.value,
    transform: [{ translateY: (1 - title.value) * 14 }],
  }));

  if (done) return null;

  const nativeBackground = nativeDark ? geometry.colors.dark : geometry.colors.light;
  const background = dark ? geometry.colors.dark : geometry.colors.light;
  const dotColor = dark ? geometry.colors.dotDark : geometry.colors.dotLight;
  const { sun, sparkle } = geometry;

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: nativeBackground }, overlayStyle]}
      onLayout={() => {
        // The first frame is on screen and matches the native splash, so swap them.
        SplashScreen.hide();
        setStarted(true);
      }}
    >
      {switchTheme && <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: background }, themedStyle]} />}
      <Animated.View style={[styles.stage, stageStyle]}>
        {geometry.dots.map((dot, i) => (
          <RouteDot key={i} index={i} count={geometry.dots.length} progress={route} color={dotColor} {...dot} />
        ))}
        <Animated.View
          style={[
            styles.glow,
            { left: (sun.cx - sun.r) * unit, top: (sun.cy - sun.r) * unit, width: sun.r * 2 * unit, height: sun.r * 2 * unit },
            glowStyle,
          ]}
        />
        <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: `50% ${(geometry.pinTipY / 1024) * 100}%` }, pinStyle]}>
          <Image source={nativeDark ? art.pinDark : art.pinLight} style={StyleSheet.absoluteFill} contentFit="contain" />
          {switchTheme && (
            <Animated.View style={[StyleSheet.absoluteFill, themedStyle]}>
              <Image source={dark ? art.pinDark : art.pinLight} style={StyleSheet.absoluteFill} contentFit="contain" />
            </Animated.View>
          )}
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: `${(sun.cx / 1024) * 100}% ${(sun.cy / 1024) * 100}%` }, sunStyle]}>
          <Image source={art.sun} style={StyleSheet.absoluteFill} contentFit="contain" />
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, { transformOrigin: `${(sparkle.cx / 1024) * 100}% ${(sparkle.cy / 1024) * 100}%` }, sparkleStyle]}
        >
          <Image source={art.sparkle} style={StyleSheet.absoluteFill} contentFit="contain" />
        </Animated.View>
        <Animated.View style={[styles.title, titleStyle]}>
          <Text style={[styles.titleText, { color: dark ? "#f1f5f9" : "#ffffff" }]}>Trip Planner</Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

type DotProps = { index: number; count: number; progress: SharedValue<number>; color: string; x: number; y: number; r: number; opacity: number };

/** One dot of the flight path. Each pops in a little after the one before it. */
function RouteDot({ index, count, progress, color, x, y, r, opacity }: DotProps) {
  const start = index / count;
  const style = useAnimatedStyle(() => {
    const p = interpolate(progress.value, [start, start + 0.2], [0, 1], "clamp");
    return { opacity: p * opacity, transform: [{ scale: interpolate(p, [0, 0.6, 1], [0.2, 1.25, 1]) }] };
  });
  const size = r * 2 * unit;
  return (
    <Animated.View
      style={[{ position: "absolute", left: (x - r) * unit, top: (y - r) * unit, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", zIndex: 1000 },
  stage: { width: SPLASH_SIZE, height: SPLASH_SIZE },
  glow: { position: "absolute", borderRadius: 999, backgroundColor: "#fde68a" },
  title: { position: "absolute", left: -80, right: -80, top: SPLASH_SIZE * 0.9, alignItems: "center" },
  titleText: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
});
