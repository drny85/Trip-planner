import { useI18n } from "@trip/i18n/react";
import { useCallback } from "react";
import { Alert } from "react-native";
import { useIsOffline } from "./use-cached-query";

/**
 * For actions that can't work without a connection (AI, sharing, checkout):
 * call the returned function first; offline, it says so and returns true, so
 * the action stops instead of spinning until the signal comes back.
 */
export function useOfflineGuard() {
  const offline = useIsOffline();
  const { t } = useI18n();
  return useCallback(() => {
    if (!offline) return false;
    Alert.alert(t("offline.needsConnection"), t("offline.needsConnectionBody"));
    return true;
  }, [offline, t]);
}
