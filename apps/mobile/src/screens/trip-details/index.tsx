import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import type { TripDetails as TripDetailsData } from "@trip/backend/types";
import { useMutation, useQuery } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Alert, Share, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { shareCalendar } from "@/lib/calendar";
import { scheduleTripReminders } from "@/lib/notifications";
import { webUrl } from "@/lib/open";
import { BudgetCard } from "./budget-card";
import { DaySection } from "./day-section";
import { MemoriesGallery, MemoriesProvider } from "./memories";
import { PackingSection } from "./packing";
import { SplitCostsSection } from "./split-costs";
import { Crew, IdeasSection } from "./together";
import { DayTabs } from "./day-tabs";
import { HERO_HEIGHT, TripHero } from "./trip-hero";

export function TripDetails({ tripId }: { tripId: Id<"trips"> }) {
  const trip = useQuery(api.trips.get, { tripId });

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
        <Stack.Screen options={{ headerTransparent: false, title: "Trip" }} />
        <Text className="text-lg text-muted-foreground">This trip doesn&apos;t exist anymore.</Text>
      </View>
    );
  }
  return <Itinerary trip={trip} />;
}

function Itinerary({ trip }: { trip: TripDetailsData }) {
  const isOwner = trip.myRole === "owner";
  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const dayOffsets = useRef<Record<string, number>>({});

  // Re-schedule this trip's local reminders whenever its times or titles change.
  const reminderKey = JSON.stringify(trip.subTrips.map((d) => [d.date, d.activities.map((a) => [a.title, a.startTime, a.children.map((c) => [c.title, c.startTime])])]));
  useEffect(() => {
    void scheduleTripReminders(trip).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reminderKey captures what matters
  }, [trip._id, reminderKey]);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  // A compact title bar fades in once the hero has scrolled away.
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [HERO_HEIGHT - 140, HERO_HEIGHT - 80], [0, 1], Extrapolation.CLAMP),
  }));

  const jumpTo = (subTripId: string) => {
    const y = dayOffsets.current[subTripId];
    if (y != null) scrollRef.current?.scrollTo({ y: y - insets.top - 56, animated: true });
  };

  // Activities are rendered in a ScrollView (a trip has tens of items, not thousands), so
  // cards can animate in once and reflow smoothly when they are reordered.
  return (
    <MemoriesProvider tripId={trip._id}>
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="pb-20"
      >
        <TripHero trip={trip} scrollY={scrollY} />
        <DayTabs subTrips={trip.subTrips} onSelect={jumpTo} />
        <BudgetCard trip={trip} />
        <Crew tripId={trip._id} />
        {trip.subTrips.map((subTrip, index) => (
          <View
            key={subTrip._id}
            onLayout={(e) => {
              dayOffsets.current[subTrip._id] = e.nativeEvent.layout.y;
            }}
          >
            <DaySection subTrip={subTrip} tripId={trip._id} sectionIndex={index} canEdit={isOwner} />
          </View>
        ))}
        <MemoriesGallery />
        <IdeasSection tripId={trip._id} subTrips={trip.subTrips} />
        <SplitCostsSection tripId={trip._id} />
        <PackingSection tripId={trip._id} />
        <View className="mt-10 px-4">
          <Button variant="secondary" icon="calendar" onPress={() => void shareCalendar(trip).catch((e: unknown) => Alert.alert("Couldn't export", e instanceof Error ? e.message : undefined))}>
            Add to calendar
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
        style={[{ height: insets.top + 52 }, barStyle]}
      >
        <Text className="text-base font-bold text-foreground" numberOfLines={1}>
          {trip.title}
        </Text>
      </Animated.View>
    </View>
    </MemoriesProvider>
  );
}

/** Creates (or reuses) the read-only web link and opens the system share sheet. */
function ShareTrip({ tripId, title, isShared }: { tripId: Id<"trips">; title: string; isShared: boolean }) {
  const share = useMutation(api.trips.share);
  const unshare = useMutation(api.trips.unshare);

  const onShare = async () => {
    const token = await share({ tripId });
    const url = `${webUrl}/share/${token}`;
    await Share.share({ title, message: `${title}: ${url}`, url });
  };

  const onStop = () =>
    Alert.alert("Stop sharing?", "People with the link won't be able to see this trip anymore.", [
      { text: "Cancel", style: "cancel" },
      { text: "Stop sharing", style: "destructive", onPress: () => void unshare({ tripId }) },
    ]);

  return (
    <View className="mt-10 gap-2 px-4">
      <Button icon="share" onPress={() => void onShare()}>
        Share trip
      </Button>
      {isShared && (
        <Button variant="ghost" size="sm" onPress={onStop}>
          Stop sharing
        </Button>
      )}
    </View>
  );
}

function DeleteTrip({ tripId, title }: { tripId: Id<"trips">; title: string }) {
  const remove = useMutation(api.trips.remove);
  const router = useRouter();

  const confirm = () =>
    Alert.alert(`Delete "${title}"?`, "This removes every day and activity in the trip.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
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
        Delete trip
      </Button>
    </View>
  );
}

function LeaveTrip({ tripId, title }: { tripId: Id<"trips">; title: string }) {
  const leave = useMutation(api.members.leave);
  const router = useRouter();
  const confirm = () =>
    Alert.alert(`Leave "${title}"?`, "You'll need a new invite to rejoin.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
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
        Leave trip
      </Button>
    </View>
  );
}
