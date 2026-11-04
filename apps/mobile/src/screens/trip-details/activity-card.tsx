import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticSetCompleted } from "@trip/backend/optimistic";
import type { Activity } from "@trip/backend/types";
import { cn } from "@trip/ui";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { Image } from "@/components/image";
import { callPhone, openDirections, openInAppBrowser } from "@/lib/open";

type Props = { activity: Activity; tripId: Id<"trips">; isLast: boolean };

export function ActivityCard({ activity, tripId, isLast }: Props) {
  const setCompleted = useMutation(api.activities.setCompleted).withOptimisticUpdate(optimisticSetCompleted);
  const done = activity.isCompleted;

  const toggle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setCompleted({ activityId: activity._id, isCompleted: !done });
  };

  return (
    <View className="flex-row px-4">
      {/* Timeline rail with the completion checkbox */}
      <View className="w-10 items-center">
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={`Mark ${activity.title} as ${done ? "not done" : "done"}`}
          onPress={toggle}
          hitSlop={10}
          className={cn(
            "mt-4 h-7 w-7 items-center justify-center rounded-full border-2",
            done ? "border-success bg-success" : "border-border bg-card",
          )}
        >
          {done && <Icon name="check" size={14} colorVar="--color-card" />}
        </Pressable>
        {!isLast && <View className="w-0.5 flex-1 bg-border" />}
      </View>

      <Link
        href={{ pathname: "/trips/[tripId]/activity/[activityId]", params: { tripId, activityId: activity._id } }}
        asChild
      >
        <Pressable className={cn("mb-4 ml-2 flex-1 overflow-hidden rounded-2xl bg-card active:opacity-80", done && "opacity-60")}>
          <View className="flex-row gap-3 p-3">
            <Image source={activity.photoUrl} className="h-20 w-20 rounded-xl" contentFit="cover" transition={150} />
            <View className="flex-1 gap-1">
              {activity.startTime && (
                <View className="flex-row items-center gap-1">
                  <Icon name="clock" size={12} colorVar="--color-muted-foreground" />
                  <Text className="text-xs font-medium text-muted-foreground">
                    {activity.startTime}
                    {activity.durationMinutes ? ` · ${formatDuration(activity.durationMinutes)}` : ""}
                  </Text>
                </View>
              )}
              <Text className={cn("text-base font-bold text-foreground", done && "line-through")} numberOfLines={2}>
                {activity.title}
              </Text>
              <Text className="text-sm text-muted-foreground" numberOfLines={2}>
                {activity.description}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-1 px-3">
            <Icon name="pin" size={12} colorVar="--color-muted-foreground" />
            <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>
              {activity.address}
            </Text>
          </View>

          <View className="flex-row flex-wrap gap-2 p-3">
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
        </Pressable>
      </Link>
    </View>
  );
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}
