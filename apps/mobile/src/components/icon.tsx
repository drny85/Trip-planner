import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import { useCSSVariable } from "uniwind";

/** One name per icon used in the app, mapped to SF Symbols (iOS) and Material Symbols (Android/web). */
const icons = {
  phone: { ios: "phone.fill", android: "call", web: "call" },
  directions: { ios: "arrow.triangle.turn.up.right.diamond.fill", android: "directions", web: "directions" },
  check: { ios: "checkmark", android: "check", web: "check" },
  edit: { ios: "pencil", android: "edit", web: "edit" },
  up: { ios: "arrow.up", android: "arrow_upward", web: "arrow_upward" },
  down: { ios: "arrow.down", android: "arrow_downward", web: "arrow_downward" },
  trash: { ios: "trash", android: "delete", web: "delete" },
  sparkles: { ios: "sparkles", android: "auto_awesome", web: "auto_awesome" },
  plus: { ios: "plus", android: "add", web: "add" },
  ticket: { ios: "ticket.fill", android: "event_seat", web: "event_seat" },
  globe: { ios: "globe", android: "language", web: "language" },
  pin: { ios: "mappin", android: "location_on", web: "location_on" },
  clock: { ios: "clock", android: "schedule", web: "schedule" },
  calendar: { ios: "calendar", android: "calendar_today", web: "calendar_today" },
  chevron: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
  share: { ios: "square.and.arrow.up", android: "share", web: "share" },
  route: { ios: "point.topleft.down.to.point.bottomright.curvepath.fill", android: "route", web: "route" },
  location: { ios: "location.fill", android: "my_location", web: "my_location" },
  sun: { ios: "sun.max.fill", android: "wb_sunny", web: "wb_sunny" },
  logout: { ios: "rectangle.portrait.and.arrow.right", android: "logout", web: "logout" },
  document: { ios: "doc.text.fill", android: "description", web: "description" },
  photo: { ios: "photo.on.rectangle", android: "image", web: "image" },
  mail: { ios: "envelope.fill", android: "mail", web: "mail" },
  map: { ios: "map.fill", android: "map", web: "map" },
  lockScreen: { ios: "iphone.badge.play", android: "smartphone", web: "smartphone" },
  undo: { ios: "arrow.uturn.backward", android: "undo", web: "undo" },
} satisfies Record<string, ComponentProps<typeof SymbolView>["name"]>;

export type IconName = keyof typeof icons;

type Props = {
  name: IconName;
  size?: number;
  /** A theme token from global.css, e.g. "--color-primary". */
  colorVar?: `--color-${string}`;
};

export function Icon({ name, size = 18, colorVar = "--color-foreground" }: Props) {
  const color = useCSSVariable(colorVar);
  return (
    <SymbolView
      name={icons[name]}
      size={size}
      tintColor={typeof color === "string" ? color : undefined}
    />
  );
}
