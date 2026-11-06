import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type Widgets = {
  widget: typeof import("./next-stop-widget").default;
  activity: typeof import("./next-stop-activity").default;
};

let loaded: Widgets | null | undefined;

/**
 * The "Next stop" widget and Live Activity, or null where they don't exist:
 * Android, the web, and an older iOS build made before expo-widgets was added
 * (so a JS reload on such a build doesn't crash).
 */
export function nativeWidgets(): Widgets | null {
  if (loaded !== undefined) return loaded;
  loaded = null;
  if (Platform.OS === "ios" && requireOptionalNativeModule("ExpoWidgets")) {
    try {
      /* eslint-disable @typescript-eslint/no-require-imports */
      loaded = { widget: require("./next-stop-widget").default, activity: require("./next-stop-activity").default };
      /* eslint-enable @typescript-eslint/no-require-imports */
    } catch {
      loaded = null;
    }
  }
  return loaded;
}
