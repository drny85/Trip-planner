import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { api } from "@trip/backend/api";
import { useI18n } from "@trip/i18n/react";
import { copyEnd, dayTitle, localToday, suggestedCopyStart } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, useColorScheme, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";
import { Button } from "@/components/button";
import { LinearGradient } from "@/components/gradient";
import { Icon } from "@/components/icon";
import { SmartImage } from "@/components/smart-image";
import { enterUp } from "@/lib/motion";

/** "YYYY-MM-DD" <-> a local Date at noon, so time zones never move the day. */
const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12);
};
const toIso = (date: Date) => localToday(date);

/** A shared itinerary opened on the phone: what's in it, and "Use this trip" with your own dates. */
export function SharedTrip({ token }: { token: string }) {
  const trip = useQuery(api.trips.getShared, { token });
  const copyShared = useMutation(api.trips.copyShared);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const accent = useCSSVariable("--color-primary");
  const { t, f, locale } = useI18n();
  const [today] = useState(() => localToday());
  const [start, setStart] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (trip === undefined) return <ActivityIndicator className="mt-16" />;
  if (trip === null)
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-background p-8">
        <Text className="text-4xl">🔒</Text>
        <Text className="text-xl font-bold text-foreground">{t("trip.linkInactiveTitle")}</Text>
        <Text className="text-center text-muted-foreground">{t("trip.linkInactiveBody")}</Text>
      </View>
    );

  const startDate = start ?? suggestedCopyStart(trip.startDate, today);
  const places = trip.subTrips.reduce((n, d) => n + d.activities.length, 0);

  const onCopy = async () => {
    setBusy(true);
    setError(null);
    try {
      const tripId = await copyShared({ token, startDate });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: "/trips/[tripId]", params: { tripId } });
    } catch {
      setError(t("copyTrip.failed"));
      setBusy(false);
    }
  };

  const picker = (
    <DateTimePicker
      value={toDate(startDate)}
      minimumDate={toDate(today)}
      mode="date"
      display={Platform.OS === "ios" ? "compact" : "default"}
      locale={locale}
      accentColor={typeof accent === "string" ? accent : undefined}
      themeVariant={scheme === "dark" ? "dark" : "light"}
      onValueChange={(_, date) => {
        setPickerOpen(false);
        setStart(toIso(date));
      }}
      onDismiss={() => setPickerOpen(false)}
    />
  );

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <Animated.View entering={enterUp(0)} className="overflow-hidden rounded-[28px] bg-card shadow-lg shadow-black/10">
        <View className="h-56">
          <SmartImage uri={trip.imageUrl} seed={trip.destination} emoji="🌏" className="absolute inset-0" />
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.75)"]} className="absolute inset-0" />
          <View className="absolute bottom-4 left-5 right-5">
            <Text className="text-sm font-semibold text-white/85">📍 {trip.destination}</Text>
            <Text className="text-3xl font-extrabold text-white">{trip.title}</Text>
            <Text className="text-sm text-white/80">
              {t("copyTrip.days", { count: trip.subTrips.length })} · {t("copyTrip.places", { count: places })}
            </Text>
          </View>
        </View>

        <View className="gap-4 p-5">
          <View className="gap-1">
            <Text className="text-xl font-extrabold text-foreground">{t("copyTrip.title")}</Text>
            <Text className="text-sm text-muted-foreground">{t("copyTrip.body")}</Text>
          </View>

          <View className="flex-row items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3">
            <View className="flex-row items-center gap-2">
              <Icon name="calendar" colorVar="--color-primary" />
              <Text className="font-semibold text-foreground">{t("copyTrip.startLabel")}</Text>
            </View>
            {Platform.OS === "ios" ? (
              picker
            ) : (
              <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" hitSlop={8}>
                <Text className="font-semibold text-primary">{f.day(startDate)}</Text>
              </Pressable>
            )}
          </View>
          {Platform.OS !== "ios" && pickerOpen && picker}
          <Text className="-mt-2 text-sm text-muted-foreground">{t("copyTrip.endsOn", { date: f.longDay(copyEnd(trip, startDate)) })}</Text>

          <View className="gap-1.5">
            <Text className="text-sm text-muted-foreground">✅ {t("copyTrip.comesAlong")}</Text>
            <Text className="text-sm text-muted-foreground">🧹 {t("copyTrip.staysBehind")}</Text>
          </View>

          {error && <Text className="text-sm font-medium text-danger">{error}</Text>}
          <Button icon="plus" onPress={() => void onCopy()} loading={busy}>
            {busy ? t("copyTrip.copying") : t("copyTrip.copy")}
          </Button>
        </View>
      </Animated.View>

      {trip.subTrips.map((day, i) => (
        <Animated.View key={day._id} entering={enterUp(i + 1)} className="gap-2 rounded-3xl bg-card p-4">
          <View className="flex-row items-baseline justify-between gap-2">
            <Text className="flex-1 text-base font-bold text-foreground" numberOfLines={1}>
              {t("time.dayN", { day: day.dayNumber })} · {dayTitle(day.title)}
            </Text>
            <Text className="text-xs font-semibold text-muted-foreground">{t("copyTrip.places", { count: day.activities.length })}</Text>
          </View>
          {day.activities.slice(0, 4).map((a) => (
            <Text key={a._id} className="text-sm text-muted-foreground" numberOfLines={1}>
              {a.startTime ? `${f.time(a.startTime)}  ` : "• "}
              {a.title}
            </Text>
          ))}
          {day.activities.length > 4 && <Text className="text-sm text-muted-foreground">…</Text>}
        </Animated.View>
      ))}
    </ScrollView>
  );
}
