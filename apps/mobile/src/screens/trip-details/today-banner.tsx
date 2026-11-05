import { useI18n } from "@trip/i18n/react";
import { localToday } from "@trip/ui";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";

/** On a travel day, a banner into today mode; before the trip, a quiet link to preview it. */
export function TodayBanner({ trip }: { trip: { _id: string; startDate: string; endDate: string } }) {
  const router = useRouter();
  const { t } = useI18n();
  const today = localToday();
  const live = today >= trip.startDate && today <= trip.endDate;
  const open = () => router.push({ pathname: "/trips/[tripId]/today", params: live ? { tripId: trip._id } : { tripId: trip._id, day: "1" } });

  if (!live) {
    return (
      <PressableScale onPress={open} className="mx-4 mt-3 flex-row items-center justify-end gap-1">
        <Text className="text-sm font-semibold text-muted-foreground">☀️ {t("today.bannerPreview")}</Text>
        <Icon name="chevron" size={12} colorVar="--color-muted-foreground" />
      </PressableScale>
    );
  }
  return (
    <PressableScale onPress={open} accessibilityRole="button" className="mx-4 mt-4 flex-row items-center gap-3 rounded-3xl bg-primary p-4">
      <Text className="text-3xl">☀️</Text>
      <View className="flex-1">
        <Text className="font-bold text-primary-foreground">{t("today.bannerTitle")}</Text>
        <Text className="text-sm text-primary-foreground/80">{t("today.bannerBodyShort")}</Text>
      </View>
      <Icon name="chevron" colorVar="--color-primary-foreground" />
    </PressableScale>
  );
}
