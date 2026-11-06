import { Gauge, HStack, Image, Link, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  progressViewStyle,
  tint,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { NextStopProps } from "./types";

/**
 * "Next stop" home screen and Lock Screen widget. Everything it uses must be
 * declared inside the function: the 'widget' directive ships only its body to
 * the widget's own runtime (no imports beyond Expo UI, no hooks, no app state).
 */
const NextStopWidget = (props: NextStopProps, environment: WidgetEnvironment) => {
  "widget";
  // The React Compiler's cache helper doesn't exist in the widget runtime.
  "use no memo";
  const BRAND = "#0e7c66";
  const BRAND_DARK = "#0a5a4a";
  const fullColor = environment.widgetRenderingMode == null || environment.widgetRenderingMode === "fullColor";
  const white = fullColor ? "#FFFFFF" : undefined;
  const soft = fullColor ? "#FFFFFFCC" : undefined;
  const family = environment.widgetFamily;
  const symbol = (props.symbol || "mappin.circle.fill") as never;

  // Lock Screen: one line of text.
  if (family === "accessoryInline") {
    return (
      <Text modifiers={[widgetURL(props.url)]}>
        {props.state === "stop" && props.time ? props.time + " · " + props.title : props.title}
      </Text>
    );
  }

  // Lock Screen: how much of the day is done.
  if (family === "accessoryCircular") {
    return (
      <Gauge value={props.total ? props.done / props.total : 0} modifiers={[widgetURL(props.url)]}>
        <Image systemName={symbol} />
      </Gauge>
    );
  }

  // Lock Screen: the next stop in three lines.
  if (family === "accessoryRectangular") {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[frame({ maxWidth: Infinity, alignment: "leading" }), widgetURL(props.url)]}>
        <Text modifiers={[font({ weight: "semibold", size: 13 }), lineLimit(1)]}>
          {props.state === "stop" && props.time ? props.eyebrow + " · " + props.time : props.eyebrow}
        </Text>
        <Text modifiers={[font({ weight: "bold", size: 15 }), lineLimit(1)]}>{props.title}</Text>
        <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{props.detail}</Text>
      </VStack>
    );
  }

  const widgetBackground = containerBackground(
    fullColor ? { type: "linearGradient", colors: [BRAND, BRAND_DARK], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } } : "clear",
    "widget",
  );

  const header = (
    <HStack spacing={4}>
      <Image systemName={symbol} size={12} color={white} />
      <Text modifiers={[font({ weight: "bold", size: 11 }), foregroundStyle(soft ?? "secondary"), lineLimit(1)]}>
        {props.eyebrow.toUpperCase()}
      </Text>
      <Spacer />
      {props.total > 0 && family !== "systemSmall" && (
        <Text modifiers={[font({ weight: "medium", size: 11 }), foregroundStyle(soft ?? "secondary")]}>{props.progress}</Text>
      )}
    </HStack>
  );

  const body = (
    <VStack alignment="leading" spacing={2}>
      {props.state === "stop" && !!props.time && (
        <Text modifiers={[font({ weight: "heavy", size: family === "systemSmall" ? 20 : 22, design: "rounded" }), foregroundStyle(white ?? "primary")]}>
          {props.time}
        </Text>
      )}
      <Text modifiers={[font({ weight: "bold", size: family === "systemSmall" ? 15 : 17 }), foregroundStyle(white ?? "primary"), lineLimit(2)]}>
        {props.title}
      </Text>
      <Text modifiers={[font({ size: 12 }), foregroundStyle(soft ?? "secondary"), lineLimit(family === "systemSmall" ? 2 : 1)]}>
        {props.detail}
      </Text>
    </VStack>
  );

  const progress =
    props.total > 0 ? (
      <ProgressView
        value={props.done / props.total}
        modifiers={[progressViewStyle("linear"), tint(white ?? BRAND), frame({ maxWidth: Infinity })]}
      />
    ) : null;

  if (family === "systemSmall") {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[widgetBackground, frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }), widgetURL(props.url)]}>
        {header}
        <Spacer />
        {body}
        {progress}
      </VStack>
    );
  }

  // systemMedium: the stop, what comes after it, and a Directions button.
  return (
    <VStack alignment="leading" spacing={6} modifiers={[widgetBackground, frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }), widgetURL(props.url)]}>
      {header}
      <Text modifiers={[font({ size: 11 }), foregroundStyle(soft ?? "secondary"), lineLimit(1)]}>{props.trip}</Text>
      <Spacer />
      <HStack alignment="bottom" spacing={8}>
        {body}
        <Spacer />
        {!!props.directionsUrl && (
          <Link destination={props.directionsUrl}>
            <HStack
              spacing={4}
              modifiers={[
                padding({ horizontal: 10, vertical: 6 }),
                background(fullColor ? "#FFFFFF33" : "#80808033"),
                clipShape("capsule"),
              ]}
            >
              <Image systemName="arrow.triangle.turn.up.right.circle.fill" size={14} color={white} />
              <Text modifiers={[font({ weight: "semibold", size: 12 }), foregroundStyle(white ?? "primary")]}>{props.directionsLabel}</Text>
            </HStack>
          </Link>
        )}
      </HStack>
      {!!props.then && (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(soft ?? "secondary"), lineLimit(1)]}>{props.then}</Text>
      )}
      {progress}
    </VStack>
  );
};

export const NEXT_STOP_WIDGET = "NextStop";

/** Before the app first runs (the widget gallery): the app's name, no text to translate. */
const placeholder: NextStopProps = {
  state: "idle",
  eyebrow: "Trip Planner",
  title: "Trip Planner",
  time: "",
  detail: "",
  trip: "",
  progress: "",
  done: 0,
  total: 0,
  then: "",
  url: "tripplanner://",
  directionsUrl: "",
  directionsLabel: "",
  symbol: "map.fill",
};

export default createWidget<NextStopProps>(NEXT_STOP_WIDGET, NextStopWidget, placeholder);
