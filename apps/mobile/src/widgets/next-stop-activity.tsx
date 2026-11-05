import { HStack, Image, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  labelsHidden,
  lineLimit,
  monospacedDigit,
  multilineTextAlignment,
  padding,
  progressViewStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";
import type { NextStopActivityProps } from "./types";

/**
 * Travel-day Live Activity: the next stop on the Lock Screen and in the Dynamic
 * Island, with a countdown that ticks on its own. As with the widget, only the
 * function body reaches the widget runtime, so everything lives inside it.
 */
const NextStopActivity = (props: NextStopActivityProps, environment: LiveActivityEnvironment) => {
  "widget";
  const BRAND = "#0e7c66";
  const ACCENT = environment.isLuminanceReduced ? "#FFFFFF" : "#5eead4";
  const symbol = (props.symbol || "mappin.circle.fill") as never;
  const counting = props.state === "stop" && props.untilMs > 0;
  const since = new Date(props.sinceMs || Date.now());
  const until = new Date(props.untilMs || Date.now());

  // The countdown clamps at 0:00 instead of counting back up past the time.
  const Countdown = ({ size, color, width }: { size: number; color: string; width: number }) =>
    counting ? (
      <Text
        timerInterval={{ lower: since, upper: until }}
        countsDown
        modifiers={[
          font({ weight: "semibold", size }),
          monospacedDigit(),
          foregroundStyle(color),
          multilineTextAlignment("trailing"),
          frame({ width, alignment: "trailing" }),
        ]}
      />
    ) : (
      <Text modifiers={[font({ weight: "semibold", size }), foregroundStyle(color)]}>{props.time}</Text>
    );

  const DayProgress = ({ color }: { color: string }) =>
    props.total > 0 ? (
      <ProgressView
        value={props.done / props.total}
        modifiers={[progressViewStyle("linear"), tint(color), labelsHidden(), frame({ maxWidth: Infinity })]}
      />
    ) : null;

  return {
    banner: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 16 }), activityBackgroundTint(BRAND)]}>
        <HStack spacing={6}>
          <Image systemName={symbol} size={14} color="#FFFFFF" />
          <Text modifiers={[font({ weight: "bold", size: 12 }), foregroundStyle("#FFFFFFCC"), lineLimit(1)]}>
            {props.eyebrow.toUpperCase()}
          </Text>
          <Spacer />
          {counting && (
            <Text modifiers={[font({ size: 12 }), foregroundStyle("#FFFFFFCC")]}>{props.untilLabel}</Text>
          )}
          <Countdown size={13} color="#FFFFFF" width={56} />
        </HStack>
        <HStack alignment="firstTextBaseline" spacing={8}>
          <Text modifiers={[font({ weight: "bold", size: 18 }), foregroundStyle("#FFFFFF"), lineLimit(1)]}>{props.title}</Text>
          <Spacer />
          {counting && !!props.time && (
            <Text modifiers={[font({ weight: "semibold", size: 15 }), foregroundStyle("#FFFFFF")]}>{props.time}</Text>
          )}
        </HStack>
        <Text modifiers={[font({ size: 13 }), foregroundStyle("#FFFFFFCC"), lineLimit(1)]}>{props.detail}</Text>
        <HStack spacing={8}>
          <DayProgress color="#FFFFFF" />
          {props.total > 0 && (
            <Text modifiers={[font({ size: 11 }), foregroundStyle("#FFFFFFCC")]}>{props.progress}</Text>
          )}
        </HStack>
      </VStack>
    ),
    compactLeading: <Image systemName={symbol} color={ACCENT} modifiers={[padding({ leading: 4 })]} />,
    compactTrailing: <Countdown size={13} color={ACCENT} width={48} />,
    minimal: <Image systemName={symbol} color={ACCENT} />,
    expandedLeading: (
      <HStack spacing={6} modifiers={[padding({ leading: 6 })]}>
        <Image systemName={symbol} color={ACCENT} />
        <Text modifiers={[font({ weight: "semibold", size: 13 }), foregroundStyle("#FFFFFFCC"), lineLimit(1)]}>{props.eyebrow}</Text>
      </HStack>
    ),
    expandedTrailing: (
      <HStack modifiers={[padding({ trailing: 6 })]}>
        <Countdown size={15} color={ACCENT} width={64} />
      </HStack>
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ horizontal: 6, top: 2 })]}>
        <HStack spacing={8}>
          <Text modifiers={[font({ weight: "bold", size: 17 }), foregroundStyle("#FFFFFF"), lineLimit(1)]}>{props.title}</Text>
          <Spacer />
          {!!props.time && <Text modifiers={[font({ size: 14 }), foregroundStyle("#FFFFFFCC")]}>{props.time}</Text>}
        </HStack>
        <Text modifiers={[font({ size: 13 }), foregroundStyle("#FFFFFFCC"), lineLimit(1)]}>{props.then || props.detail}</Text>
        <DayProgress color={ACCENT} />
      </VStack>
    ),
  };
};

export default createLiveActivity<NextStopActivityProps>("NextStopActivity", NextStopActivity);
