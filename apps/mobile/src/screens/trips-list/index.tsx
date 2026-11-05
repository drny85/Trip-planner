import { api } from "@trip/backend/api";
import type { Trip } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { localToday, tripLength } from "@trip/ui";
import { useMutation } from "convex/react";
import { Link, Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, useColorScheme, View } from "react-native";
import Animated from "react-native-reanimated";
import { SignOutButton } from "@/components/auth-gate";
import { authEnabled } from "@/providers/app-providers";
import { Button } from "@/components/button";
import { LinearGradient } from "@/components/gradient";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { SmartImage } from "@/components/smart-image";
import { enterUp } from "@/lib/motion";
import { BellButton } from "@/screens/notifications";
import { OfflineBanner } from "@/components/offline-banner";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { UpNext } from "./up-next";

export function TripsList() {
  const { data: trips, isCached } = useCachedQuery(api.trips.list, {});
  const router = useRouter();
  const { t } = useI18n();

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: authEnabled ? () => <SignOutButton /> : undefined,
          headerRight: () => (
            <View className="flex-row items-center gap-7 px-2">
              <Pressable accessibilityLabel={t("mobile.titleSettings")} onPress={() => router.push("/language")} hitSlop={12}>
                <Text className="text-xl">🌐</Text>
              </Pressable>
              <BellButton />
              <Pressable accessibilityLabel={t("mobileTrips.planNew")} onPress={() => router.push("/generate")} hitSlop={12}>
                <Icon name="plus" size={22} colorVar="--color-primary" />
              </Pressable>
            </View>
          ),
        }}
      />
      {trips === undefined ? (
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator />
        </View>
      ) : (
        // A plain ScrollView: a person has a handful of trips, and it lets cards animate in once.
        <ScrollView
          className="flex-1 bg-background"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="gap-5 p-4 pb-16"
        >
          <OfflineBanner cached={isCached} />
          <PrefetchTrips trips={trips} />
          {trips.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <UpNext />
              <Animated.View entering={enterUp(0)}>
                <PlanCta />
              </Animated.View>
              {trips.map((trip, index) => (
                <Animated.View key={trip._id} entering={enterUp(index + 1)}>
                  <TripCard trip={trip} />
                </Animated.View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </>
  );
}

/** On the green card in light mode; the card is a quiet tint in dark mode, so its icons are green there. */
function PlanIcon({ name }: { name: "sparkles" | "chevron" }) {
  const dark = useColorScheme() === "dark";
  return <Icon name={name} size={name === "sparkles" ? 22 : 16} colorVar={dark ? "--color-primary" : "--color-primary-foreground"} />;
}

function PlanCta() {
  const { t } = useI18n();
  return (
    <Link href="/generate" asChild>
      <PressableScale className="flex-row items-center gap-4 rounded-3xl bg-primary p-5 dark:border dark:border-primary/30 dark:bg-primary/15">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20 dark:bg-primary/20">
          <PlanIcon name="sparkles" />
        </View>
        <View className="flex-1">
          <Text className="text-lg font-bold text-primary-foreground dark:text-foreground">{t("mobileTrips.whereNext")}</Text>
          <Text className="text-primary-foreground/80 dark:text-muted-foreground">{t("mobileTrips.whereNextBody")}</Text>
        </View>
        <PlanIcon name="chevron" />
      </PressableScale>
    </Link>
  );
}

function TripCard({ trip }: { trip: Trip & { isOwner: boolean } }) {
  const days = tripLength(trip.startDate, trip.endDate);
  const { t, f } = useI18n();
  return (
    <Link href={{ pathname: "/trips/[tripId]", params: { tripId: trip._id } }} asChild>
      <PressableScale className="h-64 overflow-hidden rounded-[28px] bg-card" pressedScale={0.98}>
        {/* iOS zooms this photo into the trip page's hero (Link.AppleZoomTarget there). */}
        <Link.AppleZoom>
          <View className="absolute inset-0">
            <SmartImage uri={trip.imageUrl} seed={trip._id} className="absolute inset-0" emoji="✈️" />
          </View>
        </Link.AppleZoom>
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.05)", "rgba(0,0,0,0.75)"]}
          className="absolute inset-0"
        />
        <View className="absolute left-4 right-4 top-4 flex-row gap-2">
          <Chip>{t("time.days", { count: days })}</Chip>
          {!trip.isOwner ? <Chip>{`👥 ${t("trips.joined")}`}</Chip> : trip.isAIGenerated && <Chip>{`✨ ${t("trips.ai")}`}</Chip>}
        </View>
        <View className="absolute inset-x-0 bottom-0 gap-1 p-5">
          <Text className="text-3xl font-extrabold tracking-tight text-white" numberOfLines={1}>
            {trip.title}
          </Text>
          <Text className="text-white/85">
            {trip.destination} · {f.dateRange(trip.startDate, trip.endDate)}
          </Text>
        </View>
      </PressableScale>
    </Link>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <View className="rounded-full bg-black/35 px-3 py-1">
      <Text className="text-xs font-semibold text-white">{children}</Text>
    </View>
  );
}

function EmptyState() {
  const router = useRouter();
  const seed = useMutation(api.seed.demoTrip);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const loadDemo = async () => {
    setLoading(true);
    try {
      const tripId = await seed();
      router.push({ pathname: "/trips/[tripId]", params: { tripId } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View entering={enterUp(0)} className="items-center gap-4 rounded-[28px] bg-card p-8">
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
        <Icon name="sparkles" size={36} colorVar="--color-primary" />
      </View>
      <Text className="text-center text-2xl font-extrabold text-foreground">{t("mobileTrips.firstTrip")}</Text>
      <Text className="text-center text-muted-foreground">{t("trips.emptyBody")}</Text>
      <Button icon="sparkles" className="self-stretch" onPress={() => router.push("/generate")}>
        {t("nav.planWithAI")}
      </Button>
      <Button variant="secondary" className="self-stretch" loading={loading} onPress={loadDemo}>
        {t("trips.loadDemo")}
      </Button>
    </Animated.View>
  );
}

/**
 * Keeps an offline copy of every trip that hasn't ended yet, so the itinerary
 * opens with no signal even if it wasn't viewed recently.
 */
function PrefetchTrips({ trips }: { trips: { _id: Trip["_id"]; endDate: string }[] }) {
  const today = localToday();
  return (
    <>
      {trips
        .filter((t) => t.endDate >= today)
        .slice(0, 6)
        .map((t) => (
          <PrefetchTrip key={t._id} tripId={t._id} />
        ))}
    </>
  );
}

function PrefetchTrip({ tripId }: { tripId: Trip["_id"] }) {
  useCachedQuery(api.trips.get, { tripId });
  useCachedQuery(api.packing.list, { tripId });
  return null;
}
