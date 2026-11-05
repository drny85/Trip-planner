import { cn } from "@trip/ui";
import type { ReactNode } from "react";
import { ActivityIndicator, Text, type PressableProps } from "react-native";
import { Icon, type IconName } from "./icon";
import { PressableScale } from "./pressable-scale";

/** `light` and `glass` sit on photos or dark hero cards and look the same in both themes. */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "light" | "glass";

const container: Record<Variant, string> = {
  primary: "bg-primary",
  secondary: "bg-muted",
  ghost: "bg-transparent",
  danger: "bg-danger/10",
  light: "bg-on-image",
  glass: "bg-on-image/15",
};
const label: Record<Variant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-foreground",
  ghost: "text-primary",
  danger: "text-danger",
  light: "text-ink",
  glass: "text-on-image",
};
const iconColor: Record<Variant, `--color-${string}`> = {
  primary: "--color-primary-foreground",
  secondary: "--color-foreground",
  ghost: "--color-primary",
  danger: "--color-danger",
  light: "--color-ink",
  glass: "--color-on-image",
};

type Props = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  size?: "sm" | "md";
  className?: string;
};

export function Button({
  children,
  variant = "primary",
  icon,
  loading,
  size = "md",
  className,
  disabled,
  ...props
}: Props) {
  return (
    <PressableScale
      accessibilityRole="button"
      disabled={disabled || loading}
      className={cn(
        "flex-row items-center justify-center gap-2 rounded-full",
        size === "md" ? "px-5 py-3" : "px-3 py-1.5",
        container[variant],
        (disabled || loading) && "opacity-50",
        className,
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" />
      ) : (
        icon && <Icon name={icon} size={size === "md" ? 18 : 14} colorVar={iconColor[variant]} />
      )}
      <Text className={cn("font-semibold", size === "md" ? "text-base" : "text-sm", label[variant])}>
        {children}
      </Text>
    </PressableScale>
  );
}
