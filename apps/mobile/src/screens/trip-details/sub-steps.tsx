import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticSetCompleted } from "@trip/backend/optimistic";
import type { Activity } from "@trip/backend/types";
import { categoryLabel, cn, formatDuration } from "@trip/ui";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { checkPop, CSS_EASE_OUT } from "@/lib/motion";

/** The steps nested under an activity, indented one level per depth. Tap a step to edit it. */
export function SubSteps({ parent, tripId, canEdit, depth = 0 }: { parent: Activity; tripId: Id<"trips">; canEdit: boolean; depth?: number }) {
  if (parent.children.length === 0) return null;
  return (
    <View className={cn("gap-1.5", depth === 0 ? "mt-2" : "ml-4 mt-1.5")}>
      {parent.children.map((child) => (
        <View key={child._id}>
          <StepRow activity={child} tripId={tripId} canEdit={canEdit} />
          <SubSteps parent={child} tripId={tripId} canEdit={canEdit} depth={depth + 1} />
        </View>
      ))}
    </View>
  );
}

function StepRow({ activity, tripId, canEdit }: { activity: Activity; tripId: Id<"trips">; canEdit: boolean }) {
  const setCompleted = useMutation(api.activities.setCompleted).withOptimisticUpdate(optimisticSetCompleted);
  const router = useRouter();
  const done = activity.isCompleted;
  const badge = categoryLabel(activity.category, activity.subcategory);
  const meta = [activity.startTime, activity.durationMinutes ? formatDuration(activity.durationMinutes) : null].filter(Boolean).join(" · ");

  return (
    <PressableScale
      accessibilityHint={canEdit ? "Opens the step editor" : undefined}
      disabled={!canEdit}
      onPress={() => router.push({ pathname: "/trips/[tripId]/activity/[activityId]", params: { tripId, activityId: activity._id } })}
      pressedScale={0.98}
      className={cn("flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5", done && "opacity-60")}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`Mark ${activity.title} as ${done ? "not done" : "done"}`}
        hitSlop={12}
        onPress={() => {
          void Haptics.selectionAsync();
          void setCompleted({ activityId: activity._id, isCompleted: !done });
        }}
      >
        <Animated.View
          className={cn("h-6 w-6 items-center justify-center rounded-full border-2", done ? "border-success bg-success" : "border-border bg-card")}
          style={{ transitionProperty: ["backgroundColor", "borderColor"], transitionDuration: 150, transitionTimingFunction: CSS_EASE_OUT }}
        >
          {done && (
            <Animated.View entering={checkPop}>
              <Icon name="check" size={12} colorVar="--color-card" />
            </Animated.View>
          )}
        </Animated.View>
      </Pressable>
      <View className="flex-1 gap-0.5">
        <Text className={cn("text-[15px] font-semibold text-foreground", done && "text-muted-foreground line-through")} numberOfLines={1}>
          {activity.title}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {badge.emoji} {badge.text}
          {meta ? ` · ${meta}` : ""}
        </Text>
      </View>
      {canEdit && <Icon name="chevron" size={13} colorVar="--color-muted-foreground" />}
    </PressableScale>
  );
}
