import { api } from "@trip/backend/api";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { EASE_OUT } from "@/lib/motion";

const ICON = { idea: "💡", accepted: "✅", rejected: "🗳️", joined: "👋", expense: "💸", settled: "🤝" } as const;

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};

/** What the crew has been up to: ideas, votes, joins and shared costs. */
export function NotificationsScreen() {
  const feed = useQuery(api.notifications.feed);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const router = useRouter();
  const unread = feed?.unread ?? 0;

  // Opening the screen counts as reading them; the highlight stays until next time.
  useEffect(() => {
    if (unread > 0) void markAllRead();
  }, [unread, markAllRead]);

  if (!feed) return <ActivityIndicator className="mt-10" />;
  return (
    <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-2 p-4 pb-16">
      {feed.items.length === 0 ? (
        <Text className="mt-10 text-center text-muted-foreground">Nothing yet. You&apos;ll hear here when the crew suggests ideas, votes, or splits a bill.</Text>
      ) : (
        feed.items.map((n, i) => (
          <Animated.View key={n._id} entering={FadeIn.duration(200).delay(Math.min(i, 8) * 30).easing(EASE_OUT)}>
            <Pressable
              onPress={() => router.push({ pathname: "/trips/[tripId]", params: { tripId: n.tripId } })}
              className={cn("flex-row gap-3 rounded-2xl px-4 py-3", n.isRead ? "bg-card" : "bg-primary/10")}
            >
              <Text>{ICON[n.kind]}</Text>
              <Text className="flex-1 text-sm text-foreground">{n.text}</Text>
              <Text className="text-xs text-muted-foreground">{ago(n._creationTime)}</Text>
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
  return (
    <Pressable accessibilityLabel={`Notifications${feed?.unread ? `, ${feed.unread} unread` : ""}`} onPress={() => router.push("/notifications")} hitSlop={12}>
      <Text className="text-xl">🔔</Text>
      {(feed?.unread ?? 0) > 0 && <View className="absolute -right-0.5 top-0 h-2.5 w-2.5 rounded-full border border-background bg-danger" />}
    </Pressable>
  );
}
