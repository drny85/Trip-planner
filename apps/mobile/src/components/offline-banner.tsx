import { useI18n } from "@trip/i18n/react";
import { Text } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useIsOffline } from "@/hooks/use-cached-query";
import { EASE_OUT } from "@/lib/motion";
import { useOutbox } from "@/lib/outbox";

/**
 * A small pill for the connection: offline (with how many check-offs are
 * waiting), syncing them once it's back, then a short "all synced".
 */
export function OfflineBanner({ cached }: { cached?: boolean }) {
  const offline = useIsOffline();
  const { queue, lastSync } = useOutbox();
  const { t } = useI18n();
  const justSynced = lastSync !== null;

  const pending = queue.length;
  const message = offline
    ? pending > 0
      ? t("offline.waiting", { count: pending })
      : t("mobile.offline")
    : pending > 0
      ? t("offline.syncing", { count: pending })
      : justSynced
        ? t("offline.synced", { count: lastSync?.count ?? 0 })
        : cached
          ? t("mobile.savedCopy")
          : null;
  if (!message) return null;
  return (
    <Animated.View
      entering={FadeInUp.duration(220).easing(EASE_OUT)}
      exiting={FadeOutUp.duration(160)}
      className={!offline && pending === 0 && justSynced ? "mx-4 mt-2 self-center rounded-full bg-success px-4 py-2" : "mx-4 mt-2 self-center rounded-full bg-foreground/90 px-4 py-2"}
      accessibilityLiveRegion="polite"
    >
      <Text className={!offline && pending === 0 && justSynced ? "text-xs font-semibold text-white" : "text-xs font-semibold text-background"}>{message}</Text>
    </Animated.View>
  );
}
