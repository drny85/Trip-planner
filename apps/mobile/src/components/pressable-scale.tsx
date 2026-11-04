import { cn } from "@trip/ui";
import { useState, type ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";
import Animated from "react-native-reanimated";
import { CSS_EASE_OUT } from "@/lib/motion";

type Props = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  className?: string;
  /** Classes for the outer Pressable, e.g. flex sizing when the card sits in a row. */
  containerClassName?: string;
  /** How far it shrinks while held. Keep it subtle: this fires dozens of times a session. */
  pressedScale?: number;
};

/** Press feedback for every tappable surface: a 120ms scale on press-in, released on press-out. */
export function PressableScale({
  children,
  className,
  containerClassName,
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  ...props
}: Props) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      pressRetentionOffset={16}
      {...props}
      className={containerClassName}
    >
      <Animated.View
        className={cn(className)}
        style={{
          transform: [{ scale: pressed ? pressedScale : 1 }],
          transitionProperty: "transform",
          transitionDuration: 120,
          transitionTimingFunction: CSS_EASE_OUT,
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
