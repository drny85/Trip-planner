import type { Id } from "@trip/backend/dataModel";
import type { Activity } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { cn, getCategory, googlePhotoCredit } from "@trip/ui";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Button } from "@/components/button";
import { LinearGradient } from "@/components/gradient";
import { useToggleDone } from "@/components/undo-toast";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { SmartImage } from "@/components/smart-image";
import { callPhone, openDirections, openInAppBrowser } from "@/lib/open";
import { checkPop, CSS_EASE_OUT } from "@/lib/motion";
import { ActivityNotes } from "./journal";
import { ActivityPhotos } from "./memories";
import { SubSteps } from "./sub-steps";
import { useBookingFor } from "./bookings";

/** `canEdit` is false for trip members: they check things off but don't edit. */
type Props = { activity: Activity; tripId: Id<"trips">; isLast: boolean; canEdit: boolean };

export function ActivityCard({ activity, tripId, isLast, canEdit }: Props) {
  const toggleDone = useToggleDone();
  const done = activity.isCompleted;
  const category = getCategory(activity.category);
  const { t, f, category: categoryText } = useI18n();
  const credit = googlePhotoCredit(activity);
  const badge = categoryText(activity.category, activity.subcategory);
  const booking = useBookingFor(activity._id);
  const router = useRouter();

  const toggle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void toggleDone(activity, !done);
  };

  return (
    <View className="flex-row pl-4 pr-4">
      {/* Timeline rail: start time, completion checkbox and connector */}
      <View className="w-12 items-center">
        <Text className="pt-1 text-[11px] font-bold text-muted-foreground">{f.time(activity.startTime)}</Text>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={t(done ? "activity.markNotDone" : "activity.markDone", { title: activity.title })}
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

      <View className="mb-5 ml-2 flex-1">
        <PressableScale
          accessibilityHint={canEdit ? t("mobileActivity.opensEditor") : undefined}
          disabled={!canEdit}
          onPress={() =>
            router.push({
              pathname: "/trips/[tripId]/activity/[activityId]",
              params: { tripId, activityId: activity._id },
            })
          }
          pressedScale={0.98}
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
            {credit !== null && (
              <Text numberOfLines={1} className="absolute bottom-1.5 right-2 max-w-[90%] rounded bg-black/45 px-1.5 py-0.5 text-[10px] text-white/90">
                {credit ? t("activity.photoBy", { name: credit }) : "Google Maps"}
              </Text>
            )}
            <LinearGradient colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]} className="absolute inset-x-0 top-0 h-16" />
            <View className="absolute left-3 top-3 flex-row gap-2">
              <View className="flex-row items-center gap-1 rounded-full bg-black/65 px-2.5 py-1">
                <Text className="text-xs">{badge.emoji}</Text>
                <Text className="text-xs font-semibold text-white">{badge.text}</Text>
              </View>
              {activity.durationMinutes ? (
                <View className="flex-row items-center gap-1 rounded-full bg-black/65 px-2.5 py-1">
                  <Text className="text-[11px] text-white">⏱</Text>
                  <Text className="text-xs font-semibold text-white">{f.duration(activity.durationMinutes)}</Text>
                </View>
              ) : null}
              {booking && (
                <View className="flex-row items-center gap-1 rounded-full bg-success px-2.5 py-1">
                  <Text className="text-[11px]">🎫</Text>
                  <Text className="text-xs font-semibold text-white">{booking.confirmationCode ?? t("bookings.booked")}</Text>
                </View>
              )}
            </View>
            {done && (
              <View className="absolute inset-0 items-center justify-center bg-black/40">
                <Text className="rounded-full bg-success px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                  {t("activity.done")}
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
                  {t("activity.call")}
                </Button>
              )}
              <Button size="sm" variant="secondary" icon="directions" onPress={() => void openDirections(activity)} accessibilityLabel={t("activity.directions")}>
                {t("mobileActivity.maps")}
              </Button>
              {activity.bookingUrl ? (
                <Button size="sm" icon="ticket" onPress={() => void openInAppBrowser(activity.bookingUrl!)}>
                  {t("activity.reserve")}
                </Button>
              ) : activity.websiteUrl ? (
                <Button size="sm" variant="secondary" icon="globe" onPress={() => void openInAppBrowser(activity.websiteUrl!)}>
                  {t("activity.website")}
                </Button>
              ) : null}
            </View>
            <ActivityPhotos activityId={activity._id} />
            <ActivityNotes tripId={tripId} activityId={activity._id} isCompleted={done} />
          </View>
        </PressableScale>
        <SubSteps parent={activity} tripId={tripId} canEdit={canEdit} />
      </View>
    </View>
  );
}
