import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticSetCompleted } from "@trip/backend/optimistic";
import type { Activity } from "@trip/backend/types";
import { cn, formatDuration, getCategory } from "@trip/ui";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { SmartImage } from "@/components/smart-image";
import { callPhone, openDirections, openInAppBrowser } from "@/lib/open";
import { checkPop, CSS_EASE_OUT } from "@/lib/motion";

type Props = { activity: Activity; tripId: Id<"trips">; isLast: boolean };

export function ActivityCard({ activity, tripId, isLast }: Props) {
  const setCompleted = useMutation(api.activities.setCompleted).withOptimisticUpdate(optimisticSetCompleted);
  const done = activity.isCompleted;
  const category = getCategory(activity.category);
  const router = useRouter();

  const toggle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setCompleted({ activityId: activity._id, isCompleted: !done });
  };

  return (
    <View className="flex-row pl-4 pr-4">
      {/* Timeline rail: start time, completion checkbox and connector */}
      <View className="w-12 items-center">
        <Text className="pt-1 text-[11px] font-bold text-muted-foreground">{activity.startTime ?? ""}</Text>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={`Mark ${activity.title} as ${done ? "not done" : "done"}`}
          onPress={toggle}
          hitSlop={12}
          className="mt-2"
        >
          <Animated.View
            className={cn(
              "h-8 w-8 items-center justify-center rounded-full border-2",
              done ? "border-success bg-success" : "border-border bg-card",
            )}
            style={{
              transitionProperty: ["backgroundColor", "borderColor"],
              transitionDuration: 180,
              transitionTimingFunction: CSS_EASE_OUT,
            }}
          >
            {done && (
              <Animated.View entering={checkPop}>
                <Icon name="check" size={15} colorVar="--color-card" />
              </Animated.View>
            )}
          </Animated.View>
        </Pressable>
        {!isLast && <View className="mt-2 w-0.5 flex-1 rounded-full bg-border" />}
      </View>

      <PressableScale
          accessibilityHint="Opens the activity editor"
          onPress={() =>
            router.push({
              pathname: "/trips/[tripId]/activity/[activityId]",
              params: { tripId, activityId: activity._id },
            })
          }
          pressedScale={0.98}
          containerClassName="mb-5 ml-2 flex-1"
          className="overflow-hidden rounded-3xl bg-card shadow-sm shadow-black/5"
        >
          <View>
            <SmartImage
              uri={activity.photoUrl}
              seed={activity._id}
              emoji={category.emoji}
              tint={category.color}
              className="h-40 w-full"
            />
            <View className="absolute left-3 top-3 flex-row gap-2">
              <View className="flex-row items-center gap-1 rounded-full bg-black/45 px-2.5 py-1">
                <Text className="text-xs">{category.emoji}</Text>
                <Text className="text-xs font-semibold text-white">{category.label}</Text>
              </View>
              {activity.durationMinutes ? (
                <View className="flex-row items-center gap-1 rounded-full bg-black/45 px-2.5 py-1">
                  <Icon name="clock" size={11} colorVar="--color-card" />
                  <Text className="text-xs font-semibold text-white">{formatDuration(activity.durationMinutes)}</Text>
                </View>
              ) : null}
            </View>
            {done && (
              <View className="absolute inset-0 items-center justify-center bg-black/40">
                <Text className="rounded-full bg-success px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                  Done
                </Text>
              </View>
            )}
          </View>

          <View className="gap-1.5 p-4">
            <Text className={cn("text-lg font-bold leading-6 text-foreground", done && "text-muted-foreground line-through")} numberOfLines={2}>
              {activity.title}
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground" numberOfLines={2}>
              {activity.description}
            </Text>
            <View className="flex-row items-center gap-1 pt-1">
              <Icon name="pin" size={12} colorVar="--color-muted-foreground" />
              <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>
                {activity.address}
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-2 pt-2">
              {activity.phone && (
                <Button size="sm" variant="secondary" icon="phone" onPress={() => void callPhone(activity.phone!)}>
                  Call
                </Button>
              )}
              <Button size="sm" variant="secondary" icon="directions" onPress={() => void openDirections(activity)}>
                Directions
              </Button>
              {activity.bookingUrl ? (
                <Button size="sm" icon="ticket" onPress={() => void openInAppBrowser(activity.bookingUrl!)}>
                  Reserve
                </Button>
              ) : activity.websiteUrl ? (
                <Button size="sm" variant="secondary" icon="globe" onPress={() => void openInAppBrowser(activity.websiteUrl!)}>
                  Website
                </Button>
              ) : null}
            </View>
          </View>
        </PressableScale>
    </View>
  );
}
