import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn, TRAVELER_PRICE } from "@trip/ui";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { openInAppBrowser, webUrl } from "@/lib/open";
import { Button } from "./button";
import { LinearGradient } from "./gradient";

/**
 * Checkout runs on the web (Clerk Billing has no in-app purchase), so this opens
 * the pricing page in a browser sheet, then asks Convex to re-read the
 * subscription from Clerk when the sheet closes.
 */
export function useSubscribe() {
  const refresh = useAction(api.billing.refresh);
  const [busy, setBusy] = useState(false);
  const subscribe = async () => {
    setBusy(true);
    try {
      await openInAppBrowser(`${webUrl}/pricing`);
      await refresh({});
    } catch {
      // The banner stays; they can try again.
    } finally {
      setBusy(false);
    }
  };
  return { subscribe, busy };
}

/** On a trip whose organizer hasn't subscribed: what's locked and how to unlock it. */
export function TripLockedBanner({ tripId, className }: { tripId: Id<"trips">; className?: string }) {
  const lock = useQuery(api.billing.tripLocked, { tripId });
  const { subscribe, busy } = useSubscribe();
  const { t } = useI18n();
  if (!lock?.locked) return null;
  return (
    <Animated.View entering={FadeInDown.duration(350)} className={cn("overflow-hidden rounded-3xl", className)}>
      <LinearGradient colors={["#0e7c66", "#10b981"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="gap-3 p-5">
        <Text className="text-lg font-bold text-white">🔒 {lock.isOwner ? t("billing.lockedTitle") : t("billing.lockedMember")}</Text>
        {lock.isOwner && (
          <>
            <Text className="text-sm leading-5 text-white/90">{t("billing.lockedBody")}</Text>
            <Button variant="light" icon="sparkles" onPress={() => void subscribe()} loading={busy}>
              {t("billing.subscribe", { price: TRAVELER_PRICE })}
            </Button>
            <Text className="text-center text-xs text-white/80">{t("billing.cancelAnytime")}</Text>
          </>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

/** Shown instead of the planner when the plan doesn't allow another trip right now. */
export function PlanLimitNotice({ blocked, max }: { blocked: "subscribe" | "tooManyUpcoming"; max: number }) {
  const { t } = useI18n();
  const { subscribe, busy } = useSubscribe();
  const isSubscribe = blocked === "subscribe";
  return (
    <Animated.View entering={FadeInDown.duration(350)} className="items-center gap-3 rounded-3xl bg-card p-6">
      <Text className="text-5xl">{isSubscribe ? "✨" : "🧳"}</Text>
      <Text className="text-center text-2xl font-extrabold tracking-tight text-foreground">
        {isSubscribe ? t("billing.freeTitle") : t("billing.fullTitle", { max })}
      </Text>
      <Text className="text-center text-base text-muted-foreground">{isSubscribe ? t("billing.freeBody", { max }) : t("billing.fullBody")}</Text>
      {isSubscribe && (
        <View className="w-full gap-2 pt-2">
          <Button icon="sparkles" onPress={() => void subscribe()} loading={busy}>
            {t("billing.subscribe", { price: TRAVELER_PRICE })}
          </Button>
          <Text className="text-center text-xs text-muted-foreground">{t("billing.cancelAnytime")}</Text>
        </View>
      )}
    </Animated.View>
  );
}
