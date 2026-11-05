import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticSetCompleted } from "@trip/backend/optimistic";
import { useI18n } from "@trip/i18n/react";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Easing, FadeInDown, FadeOutDown, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EASE_OUT } from "@/lib/motion";

/**
 * "Marked done · Undo" toast. Checking something off happens right away; for a
 * few seconds the toast offers Undo, with a bar that runs down the time left.
 */
const UNDO_MS = 6000;

type Toast = { id: number; message: string; onUndo: () => void };
const UndoContext = createContext<(message: string, onUndo: () => void) => void>(() => {});

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((message: string, onUndo: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, onUndo });
    timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), UNDO_MS);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <UndoContext.Provider value={show}>
      {children}
      {toast && (
        <ToastView
          key={toast.id}
          message={toast.message}
          onUndo={() => {
            void Haptics.selectionAsync();
            toast.onUndo();
            setToast(null);
          }}
        />
      )}
    </UndoContext.Provider>
  );
}

function ToastView({ message, onUndo }: { message: string; onUndo: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const left = useSharedValue(1);
  const { t } = useI18n();
  useEffect(() => {
    left.set(withTiming(0, { duration: UNDO_MS, easing: Easing.linear }));
  }, [left]);
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: left.get() }] }));

  return (
    <Animated.View
      entering={(reduced ? FadeInDown.duration(1) : FadeInDown.springify().duration(320).dampingRatio(0.85)).withInitialValues({ opacity: 0, transform: [{ translateY: 24 }] })}
      exiting={FadeOutDown.duration(180).easing(EASE_OUT)}
      pointerEvents="box-none"
      className="absolute inset-x-4 z-50"
      style={{ bottom: insets.bottom + 16 }}
    >
      <View className="overflow-hidden rounded-2xl bg-foreground shadow-lg shadow-black/25" accessibilityLiveRegion="polite">
        <View className="flex-row items-center gap-3 py-2.5 pl-4 pr-2">
          <View className="h-6 w-6 items-center justify-center rounded-full bg-success">
            <Text className="text-xs font-bold text-white">✓</Text>
          </View>
          <Text className="flex-1 text-sm font-semibold text-background" numberOfLines={2}>
            {message}
          </Text>
          <Pressable onPress={onUndo} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("common.undo")} className="rounded-full bg-background/15 px-4 py-2 active:opacity-70">
            <Text className="text-sm font-bold text-background">{t("common.undo")}</Text>
          </Pressable>
        </View>
        <Animated.View className="h-1 bg-success" style={[{ transformOrigin: "left" }, bar]} />
      </View>
    </Animated.View>
  );
}

/** Toggles done with the optimistic update, and offers Undo after marking something done. */
export function useToggleDone() {
  const setCompleted = useMutation(api.activities.setCompleted).withOptimisticUpdate(optimisticSetCompleted);
  const restore = useMutation(api.activities.restoreCompleted);
  const show = useContext(UndoContext);
  const { t } = useI18n();
  return useCallback(
    async (activity: { _id: Id<"activities">; title: string }, isCompleted: boolean) => {
      const changed = await setCompleted({ activityId: activity._id, isCompleted });
      if (isCompleted && changed.length > 0) {
        const steps = changed.length - 1;
        show(steps > 0 ? t("undo.doneWithSteps", { title: activity.title, count: steps }) : t("undo.done", { title: activity.title }), () => void restore({ activityIds: changed, isCompleted: false }));
      }
    },
    [setCompleted, restore, show, t],
  );
}
