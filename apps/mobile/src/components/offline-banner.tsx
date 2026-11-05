import { useI18n } from "@trip/i18n/react";
import { Text } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useIsOffline } from "@/hooks/use-cached-query";
import { EASE_OUT } from "@/lib/motion";

/** A small pill shown while there's no connection; changes sync once it's back. */
export function OfflineBanner({ cached }: { cached?: boolean }) {
  const offline = useIsOffline();
  const { t } = useI18n();
  if (!offline && !cached) return null;
  return (
    <Animated.View
      entering={FadeInUp.duration(220).easing(EASE_OUT)}
      exiting={FadeOutUp.duration(160)}
      className="mx-4 mt-2 self-center rounded-full bg-foreground/90 px-4 py-2"
      accessibilityLiveRegion="polite"
    >
      <Text className="text-xs font-semibold text-background">
        {offline ? t("mobile.offline") : t("mobile.savedCopy")}
      </Text>
    </Animated.View>
  );
}
