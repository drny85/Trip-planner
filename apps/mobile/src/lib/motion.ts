import { cubicBezier, Easing, FadeInDown, Keyframe, LinearTransition } from "react-native-reanimated";

/** Curves from the animation guidelines: strong ease-out for UI, ease-in-out for on-screen moves. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
/** The same ease-out for Reanimated CSS transitions and animations. */
export const CSS_EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

/** Cards slide up into place when a screen first shows them. Stagger caps out so long lists don't wait. */
export const enterUp = (index: number) =>
  FadeInDown.duration(320)
    .delay(Math.min(index, 8) * 45)
    .easing(EASE_OUT);

/** Reflow when activities are reordered, moved between days or deleted. */
export const reflow = LinearTransition.duration(240).easing(EASE_IN_OUT);

/** The check mark pops in from 60% (never from 0). */
export const checkPop = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.6 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE_OUT },
}).duration(180);
