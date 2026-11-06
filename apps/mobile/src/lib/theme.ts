import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Appearance, Platform } from "react-native";
import { Uniwind } from "uniwind";

/**
 * Light, dark, or follow the phone. Saved on the device (like the language), so
 * it applies before sign-in and survives sign-out. Uniwind.setTheme also sets
 * React Native's Appearance, so useColorScheme and native headers follow it.
 */
export type ThemeChoice = "system" | "light" | "dark";
const KEY = "app-theme";

const isChoice = (v: unknown): v is ThemeChoice => v === "system" || v === "light" || v === "dark";

function readSaved(): ThemeChoice {
  try {
    const value = Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) : SecureStore.getItem(KEY);
    return isChoice(value) ? value : "system";
  } catch {
    return "system";
  }
}

/**
 * The phone's own light/dark setting at launch, read before a saved choice overrides
 * Appearance. The native splash follows the phone, so the animated splash starts from it.
 */
export const launchSystemScheme = Appearance.getColorScheme() === "dark" ? "dark" : "light";

let current: ThemeChoice = readSaved();
const listeners = new Set<() => void>();
if (current !== "system") Uniwind.setTheme(current);

export function setThemeChoice(next: ThemeChoice) {
  current = next;
  Uniwind.setTheme(next);
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, next);
    else SecureStore.setItem(KEY, next);
  } catch {
    // Not saved; it still applies until the app restarts.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useThemeChoice = () => useSyncExternalStore(subscribe, () => current);
