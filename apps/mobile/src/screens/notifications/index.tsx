import { api } from "@trip/backend/api";
import { notificationText } from "@trip/i18n";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { EASE_OUT } from "@/lib/motion";

const ICON = { idea: "💡", accepted: "✅", rejected: "🗳️", joined: "👋", expense: "💸", settled: "🤝", groupPlan: "🗳️", priceDrop: "📉", flightDelay: "⏰", flightGate: "🚪", flightCanceled: "⚠️" } as const;


/** What the crew has been up to: ideas, votes, joins and shared costs. */
export function NotificationsScreen() {
  const feed = useQuery(api.notifications.feed);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const router = useRouter();
  const unread = feed?.unread ?? 0;
  const { t, f } = useI18n();

  // Opening the screen counts as reading them; the highlight stays until next time.
  useEffect(() => {
    if (unread > 0) void markAllRead();
  }, [unread, markAllRead]);

  if (!feed) return <ActivityIndicator className="mt-10" />;
  return (
    <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-2 p-4 pb-16">
      {feed.items.length === 0 ? (
        <Text className="mt-10 text-center text-muted-foreground">{t("notifications.empty")}</Text>
      ) : (
        feed.items.map((n, i) => (
          <Animated.View key={n._id} entering={FadeIn.duration(200).delay(Math.min(i, 8) * 30).easing(EASE_OUT)}>
            <Pressable
              onPress={() => router.push({ pathname: "/trips/[tripId]", params: { tripId: n.tripId } })}
              className={cn("flex-row gap-3 rounded-2xl px-4 py-3", n.isRead ? "bg-card" : "bg-primary/10")}
            >
              <Text>{ICON[n.kind]}</Text>
              <Text className="flex-1 text-sm text-foreground">{n.params ? notificationText(t, f, n.kind, n.params) : n.text}</Text>
              <Text className="text-xs text-muted-foreground">{f.ago(n._creationTime)}</Text>
            </Pressable>
          </Animated.View>
        ))
      )}
      <View className="h-4" />
    </ScrollView>
  );
}

/** Header bell with a dot when something's unread. */
export function BellButton() {
  const feed = useQuery(api.notifications.feed);
  const router = useRouter();
  const { t } = useI18n();
  return (
    <Pressable accessibilityLabel={feed?.unread ? t("notifications.ariaUnread", { count: feed.unread }) : t("notifications.ariaLabel")} onPress={() => router.push("/notifications")} hitSlop={12}>
      <Text className="text-xl">🔔</Text>
      {(feed?.unread ?? 0) > 0 && <View className="absolute -right-0.5 top-0 h-2.5 w-2.5 rounded-full border border-background bg-danger" />}
    </Pressable>
  );
}
