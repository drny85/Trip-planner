import { api } from "@trip/backend/api";
import { useI18n } from "@trip/i18n/react";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Button } from "@/components/button";
import { LinearGradient } from "@/components/gradient";
import { SmartImage } from "@/components/smart-image";
import { enterUp } from "@/lib/motion";

/** Invite landing: a postcard of the trip and a Join button. */
export function JoinTrip({ token }: { token: string }) {
  const preview = useQuery(api.members.invitePreview, { token });
  const join = useMutation(api.members.join);
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const { t, f } = useI18n();

  if (preview === undefined) return <ActivityIndicator className="mt-16" />;
  if (preview === null)
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-background p-8">
        <Text className="text-4xl">🔗</Text>
        <Text className="text-xl font-bold text-foreground">{t("join.inactiveTitle")}</Text>
        <Text className="text-center text-muted-foreground">{t("join.inactiveBody")}</Text>
      </View>
    );

  const onJoin = async () => {
    setJoining(true);
    try {
      const tripId = await join({ token });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: "/trips/[tripId]", params: { tripId } });
    } finally {
      setJoining(false);
    }
  };
  const others = preview.memberNames.slice(1);

  return (
    <View className="flex-1 bg-background p-4">
      <Animated.View entering={enterUp(0)} className="overflow-hidden rounded-[28px] bg-card shadow-lg shadow-black/10">
        <View className="h-56">
          <SmartImage uri={preview.imageUrl} seed={preview.destination} emoji="🌏" className="absolute inset-0" />
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.75)"]} className="absolute inset-0" />
          <View className="absolute bottom-4 left-5 right-5">
            <Text className="text-sm font-semibold text-white/85">📍 {preview.destination}</Text>
            <Text className="text-3xl font-extrabold text-white">{preview.title}</Text>
            <Text className="text-sm text-white/80">{f.dateRange(preview.startDate, preview.endDate)}</Text>
          </View>
        </View>
        <View className="gap-4 p-5">
          <Text className="text-lg text-foreground">
            {others.length
              ? t("mobileSheets.invitedYouWith", { name: preview.ownerName, names: others.slice(0, 3).join(", ") })
              : t("mobileSheets.invitedYou", { name: preview.ownerName })}
            .
          </Text>
          <View className="gap-1.5">
            <Text className="text-sm text-muted-foreground">✅ {t("mobileSheets.perk1")}</Text>
            <Text className="text-sm text-muted-foreground">💡 {t("join.perk2")}</Text>
            <Text className="text-sm text-muted-foreground">🗳️ {t("mobileSheets.perk3")}</Text>
          </View>
          {preview.alreadyMember ? (
            <Button onPress={() => router.replace({ pathname: "/trips/[tripId]", params: { tripId: preview.tripId } })}>{t("mobileSheets.openTrip")}</Button>
          ) : (
            <Button onPress={() => void onJoin()} loading={joining}>
              {t("join.join")}
            </Button>
          )}
        </View>
      </Animated.View>
    </View>
  );
}
