import { useI18n } from "@trip/i18n/react";
import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import type { TripDetails as TripDetailsData } from "@trip/backend/types";
import { dayTitle } from "@trip/ui";
import { useMutation } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Share, Text, useColorScheme, View } from "react-native";
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { Button } from "@/components/button";
import { OfflineBanner } from "@/components/offline-banner";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { addToCalendar } from "@/lib/calendar";
import { refreshSyncedCalendar } from "@/lib/device-calendar";
import { scheduleTripReminders } from "@/lib/notifications";
import { shareItineraryPdf } from "@/lib/pdf";
import { webUrl } from "@/lib/open";
import { BookingsProvider, BookingsSection } from "./bookings";
import { BudgetCard } from "./budget-card";
import { DaySection } from "./day-section";
import { JournalProvider, StoryCard } from "./journal";
import { MemoriesGallery, MemoriesProvider } from "./memories";
import { PackingSection } from "./packing";
import { SplitCostsSection } from "./split-costs";
import { Crew, IdeasSection } from "./together";
import { GroupVotesSection } from "./group-votes";
import { DayTabs } from "./day-tabs";
import { HERO_HEIGHT, TripHero } from "./trip-hero";
import { TodayBanner } from "./today-banner";

export function TripDetails({ tripId }: { tripId: Id<"trips"> }) {
  const { data: trip, isCached } = useCachedQuery(api.trips.get, { tripId });
  const { t } = useI18n();

  if (trip === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }
  if (trip === null) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        <Stack.Screen options={{ headerTransparent: false, title: t("mobileTrip.trip") }} />
        <Text className="text-lg text-muted-foreground">{t("trip.notFound")}</Text>
      </View>
    );
  }
  return <Itinerary trip={trip} isCached={isCached} />;
}

/** Height of the compact title bar below the status bar; it shows the day you're looking at. */
const BAR_HEIGHT = 60;

function Itinerary({ trip, isCached }: { trip: TripDetailsData; isCached: boolean }) {
  const isOwner = trip.myRole === "owner";
  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const dayOffsets = useRef<Record<string, number>>({});
  // Where each day starts and ends in the scroll content, for the title bar.
  // Built up in a ref: a shared value's get() on the JS thread can lag a set()
  // made moments before, so merging into it directly drops days.
  const dayRangesRef = useRef<Record<string, { top: number; bottom: number }>>({});
  const dayRanges = useSharedValue<Record<string, { top: number; bottom: number }>>({});
  const [currentDayId, setCurrentDayId] = useState<string | null>(null);
  const { t, f } = useI18n();

  // Re-schedule this trip's local reminders (and calendar events) whenever its times, titles or places change.
  const step = (a: TripDetailsData["subTrips"][number]["activities"][number]) => [a.title, a.startTime, a.durationMinutes, a.address];
  const reminderKey = JSON.stringify(trip.subTrips.map((d) => [d.date, d.title, d.activities.map((a) => [...step(a), a.children.map(step)])]));
  useEffect(() => {
    void scheduleTripReminders(trip).catch(() => undefined);
    // If the trip was added to the phone's calendar, keep those events in step too.
    void refreshSyncedCalendar(trip).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reminderKey captures what matters
  }, [trip._id, reminderKey]);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  // Light status bar text over the photo; the normal one once the title bar covers it.
  const [pastHero, setPastHero] = useState(false);
  const scheme = useColorScheme();
  useAnimatedReaction(
    () => scrollY.get() > HERO_HEIGHT - 110,
    (now, before) => {
      if (now !== before) scheduleOnRN(setPastHero, now);
    },
  );

  // The day under the title bar, so the bar can say which day you're looking at.
  const barHeight = insets.top + BAR_HEIGHT;
  useAnimatedReaction(
    () => {
      const line = scrollY.get() + barHeight;
      const ranges = dayRanges.get();
      for (const id in ranges) {
        const r = ranges[id]!;
        if (line >= r.top && line < r.bottom) return id;
      }
      return null;
    },
    (now, before) => {
      if (now !== before) scheduleOnRN(setCurrentDayId, now);
    },
  );
  const currentDay = trip.subTrips.find((d) => d._id === currentDayId);

  // A compact title bar fades in once the hero has scrolled away.
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [HERO_HEIGHT - 140, HERO_HEIGHT - 80], [0, 1], Extrapolation.CLAMP),
  }));

  const jumpTo = (subTripId: string) => {
    const y = dayOffsets.current[subTripId];
    if (y == null) return;
    // A programmatic scroll doesn't always report through the scroll handler, and
    // every day starts below the hero, so set the status bar for it directly.
    setPastHero(true);
    scrollRef.current?.scrollTo({ y: y - barHeight + 1, animated: true });
  };

  // Activities are rendered in a ScrollView (a trip has tens of items, not thousands), so
  // cards can animate in once and reflow smoothly when they are reordered.
  return (
    <MemoriesProvider tripId={trip._id}>
    <JournalProvider tripId={trip._id}>
    <BookingsProvider tripId={trip._id}>
    <View className="flex-1 bg-background">
      <StatusBar style={pastHero ? (scheme === "dark" ? "light" : "dark") : "light"} animated />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        // Keeps an inline "Add step" field above the keyboard.
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerClassName="pb-20"
      >
        <TripHero trip={trip} scrollY={scrollY} />
        <DayTabs subTrips={trip.subTrips} onSelect={jumpTo} />
        <OfflineBanner cached={isCached} />
        <TodayBanner trip={trip} />
        <BudgetCard trip={trip} />
        <Crew tripId={trip._id} />
        <BookingsSection tripId={trip._id} days={trip.subTrips} />
        <GroupVotesSection tripId={trip._id} subTrips={trip.subTrips} />
        {trip.subTrips.map((subTrip, index) => (
          <View
            key={subTrip._id}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              dayOffsets.current[subTrip._id] = y;
              dayRangesRef.current[subTrip._id] = { top: y, bottom: y + height };
              dayRanges.set({ ...dayRangesRef.current });
            }}
          >
            <DaySection subTrip={subTrip} tripId={trip._id} sectionIndex={index} canEdit={isOwner} />
          </View>
        ))}
        <MemoriesGallery />
        <StoryCard tripId={trip._id} />
        <IdeasSection tripId={trip._id} subTrips={trip.subTrips} />
        <SplitCostsSection tripId={trip._id} />
        <PackingSection tripId={trip._id} />
        <View className="mt-10 gap-2 px-4">
          <Button variant="secondary" icon="calendar" onPress={() => addToCalendar(trip)}>
            {t("trip.addToCalendar")}
          </Button>
          <Button variant="secondary" icon="document" onPress={() => void shareItineraryPdf(trip).catch((e: unknown) => Alert.alert(t("print.couldnt"), e instanceof Error ? e.message : undefined))}>
            {t("print.button")}
          </Button>
        </View>
        {isOwner ? (
          <>
            <ShareTrip tripId={trip._id} title={trip.title} isShared={Boolean(trip.shareToken)} />
            <DeleteTrip tripId={trip._id} title={trip.title} />
          </>
        ) : (
          <LeaveTrip tripId={trip._id} title={trip.title} />
        )}
      </Animated.ScrollView>

      <Animated.View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 items-center justify-end border-b border-border bg-background pb-3"
        style={[{ height: barHeight }, barStyle]}
        accessibilityLiveRegion="polite"
      >
        {currentDay ? (
          // Keyed by day, so the label fades over when you scroll into the next day.
          // Wide side padding keeps the text clear of the floating back button; only
          // the day's title shortens, so "Day N" always shows.
          <Animated.View key={currentDay._id} entering={FadeIn.duration(180)} className="w-full items-center px-16">
            <Text className="text-xs font-semibold text-muted-foreground" numberOfLines={1}>
              {trip.title}
            </Text>
            <View className="max-w-full flex-row items-baseline">
              <Text className="shrink-0 text-base font-bold text-foreground">{t("time.dayN", { day: currentDay.dayNumber })} · </Text>
              <Text className="shrink text-base font-bold text-foreground" numberOfLines={1}>
                {dayTitle(currentDay.title)}
              </Text>
              {currentDay.date ? (
                <Text className="shrink-0 text-base font-medium text-muted-foreground"> · {f.weekday(currentDay.date)}</Text>
              ) : null}
            </View>
          </Animated.View>
        ) : (
          <Animated.View key="trip" entering={FadeIn.duration(180)} className="px-16">
            <Text className="text-base font-bold text-foreground" numberOfLines={1}>
              {trip.title}
            </Text>
          </Animated.View>
        )}
      </Animated.View>
    </View>
    </BookingsProvider>
    </JournalProvider>
    </MemoriesProvider>
  );
}

/** Creates (or reuses) the read-only web link and opens the system share sheet. */
function ShareTrip({ tripId, title, isShared }: { tripId: Id<"trips">; title: string; isShared: boolean }) {
  const share = useMutation(api.trips.share);
  const unshare = useMutation(api.trips.unshare);
  const { t } = useI18n();

  const onShare = async () => {
    const token = await share({ tripId });
    const url = `${webUrl}/share/${token}`;
    await Share.share({ title, message: t("mobileTrip.shareMessage", { title, url }), url });
  };

  const onStop = () =>
    Alert.alert(t("mobileTrip.stopSharingTitle"), t("mobileTrip.stopSharingBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("share.stop"), style: "destructive", onPress: () => void unshare({ tripId }) },
    ]);

  return (
    <View className="mt-10 gap-2 px-4">
      <Button icon="share" onPress={() => void onShare()}>
        {t("mobileTrip.shareTrip")}
      </Button>
      {isShared && (
        <Button variant="ghost" size="sm" onPress={onStop}>
          {t("share.stop")}
        </Button>
      )}
    </View>
  );
}

function DeleteTrip({ tripId, title }: { tripId: Id<"trips">; title: string }) {
  const remove = useMutation(api.trips.remove);
  const router = useRouter();
  const { t } = useI18n();

  const confirm = () =>
    Alert.alert(t("mobileTrip.deleteTitle", { title }), t("mobileTrip.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          router.back();
          await remove({ tripId });
        },
      },
    ]);

  return (
    <View className="mt-4 px-4">
      <Button variant="danger" icon="trash" onPress={confirm}>
        {t("trip.deleteTrip")}
      </Button>
    </View>
  );
}

function LeaveTrip({ tripId, title }: { tripId: Id<"trips">; title: string }) {
  const leave = useMutation(api.members.leave);
  const router = useRouter();
  const { t } = useI18n();
  const confirm = () =>
    Alert.alert(t("mobileTrip.leaveTitle", { title }), t("mobileTrip.leaveBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("mobileTrip.leave"),
        style: "destructive",
        onPress: async () => {
          router.back();
          await leave({ tripId });
        },
      },
    ]);
  return (
    <View className="mt-10 px-4">
      <Button variant="secondary" onPress={confirm}>
        {t("crew.leave")}
      </Button>
    </View>
  );
}
