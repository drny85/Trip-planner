import type { Id } from "@trip/backend/dataModel";
import type { Activity } from "@trip/backend/types";
import { api } from "@trip/backend/api";
import { categoryLabel, cn, fallbackPhoto, formatDuration, formatTime } from "@trip/ui";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useToggleDone } from "@/components/undo-toast";
import Animated from "react-native-reanimated";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { checkPop, CSS_EASE_OUT } from "@/lib/motion";

/**
 * The steps nested under an activity, indented one level per depth. Tap a step to
 * edit it; "+ Add step" under the activity, or the + on a step, adds one inline.
 */
export function SubSteps({ parent, tripId, canEdit, depth = 0 }: { parent: Activity; tripId: Id<"trips">; canEdit: boolean; depth?: number }) {
  const [adding, setAdding] = useState(false);
  if (parent.children.length === 0 && !canEdit) return null;
  return (
    <View className={cn("gap-1.5", depth === 0 ? "mt-2" : "ml-4 mt-1.5")}>
      {parent.children.map((child) => (
        <StepBlock key={child._id} step={child} tripId={tripId} canEdit={canEdit} depth={depth} />
      ))}
      {depth === 0 && canEdit &&
        (adding ? (
          <AddStepField parent={parent} onDone={() => setAdding(false)} />
        ) : (
          <Pressable
            onPress={() => setAdding(true)}
            accessibilityRole="button"
            accessibilityLabel={`Add a step to ${parent.title}`}
            hitSlop={6}
            className="flex-row items-center gap-1.5 self-start rounded-full px-2 py-1.5 active:opacity-60"
          >
            <Icon name="plus" size={13} colorVar="--color-primary" />
            <Text className="text-sm font-semibold text-primary">Add step</Text>
          </Pressable>
        ))}
    </View>
  );
}

/** One step, its own steps, and (after tapping its +) a field to add one inside it. */
function StepBlock({ step, tripId, canEdit, depth }: { step: Activity; tripId: Id<"trips">; canEdit: boolean; depth: number }) {
  const [adding, setAdding] = useState(false);
  return (
    <View>
      <StepRow activity={step} tripId={tripId} canEdit={canEdit} onAddInside={() => setAdding(true)} />
      <SubSteps parent={step} tripId={tripId} canEdit={canEdit} depth={depth + 1} />
      {adding && (
        <View className="ml-4 mt-1.5">
          <AddStepField parent={step} onDone={() => setAdding(false)} />
        </View>
      )}
    </View>
  );
}

/** Inline "new step" field. Return adds the step and keeps the field open for the next one. */
function AddStepField({ parent, onDone }: { parent: Activity; onDone: () => void }) {
  const create = useMutation(api.activities.create);
  const [title, setTitle] = useState("");
  // Return reports the field's own text, which can be ahead of state on a fast Return.
  const add = (text = title) => {
    const t = text.trim();
    if (!t) return onDone();
    setTitle("");
    void Haptics.selectionAsync();
    void create({
      subTripId: parent.subTripId,
      parentId: parent._id,
      title: t,
      description: "",
      address: parent.address,
      latitude: parent.latitude,
      longitude: parent.longitude,
      category: parent.category,
      subcategory: parent.subcategory,
      photoUrl: fallbackPhoto(`${parent.title}-${t}`),
    });
  };
  return (
    <View className="flex-row items-center gap-2">
      <TextInput
        autoFocus
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={(e) => add(e.nativeEvent.text)}
        onBlur={() => !title.trim() && onDone()}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder={`Add a step to "${parent.title}"`}
        placeholderTextColorClassName="accent-muted-foreground"
        className="flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] text-foreground"
      />
      <Pressable onPress={onDone} hitSlop={8} accessibilityRole="button" accessibilityLabel="Done adding steps" className="px-1 active:opacity-60">
        <Text className="text-sm font-semibold text-primary">Done</Text>
      </Pressable>
    </View>
  );
}

function StepRow({ activity, tripId, canEdit, onAddInside }: { activity: Activity; tripId: Id<"trips">; canEdit: boolean; onAddInside: () => void }) {
  const toggleDone = useToggleDone();
  const router = useRouter();
  const done = activity.isCompleted;
  const badge = categoryLabel(activity.category, activity.subcategory);
  const meta = [formatTime(activity.startTime), activity.durationMinutes ? formatDuration(activity.durationMinutes) : null].filter(Boolean).join(" · ");

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
          void toggleDone(activity, !done);
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
      {canEdit && (
        <Pressable onPress={onAddInside} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Add a step inside ${activity.title}`} className="h-7 w-7 items-center justify-center rounded-full bg-muted active:opacity-60">
          <Icon name="plus" size={12} colorVar="--color-primary" />
        </Pressable>
      )}
    </PressableScale>
  );
}
