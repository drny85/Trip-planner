import { api } from "@trip/backend/api";
import { formatDateRange } from "@trip/ui";
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

  if (preview === undefined) return <ActivityIndicator className="mt-16" />;
  if (preview === null)
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-background p-8">
        <Text className="text-4xl">🔗</Text>
        <Text className="text-xl font-bold text-foreground">This invite isn&apos;t active</Text>
        <Text className="text-center text-muted-foreground">Ask the organizer for a new link.</Text>
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
            <Text className="text-sm text-white/80">{formatDateRange(preview.startDate, preview.endDate)}</Text>
          </View>
        </View>
        <View className="gap-4 p-5">
          <Text className="text-lg text-foreground">
            <Text className="font-bold">{preview.ownerName}</Text> invited you
            {others.length ? ` with ${others.slice(0, 3).join(", ")}` : ""}.
          </Text>
          <View className="gap-1.5">
            <Text className="text-sm text-muted-foreground">✅ See the plan and check things off</Text>
            <Text className="text-sm text-muted-foreground">💡 Suggest places to go and eat</Text>
            <Text className="text-sm text-muted-foreground">🗳️ Vote: the majority decides</Text>
          </View>
          {preview.alreadyMember ? (
            <Button onPress={() => router.replace({ pathname: "/trips/[tripId]", params: { tripId: preview.tripId } })}>Open the trip</Button>
          ) : (
            <Button onPress={() => void onJoin()} loading={joining}>
              Join the trip
            </Button>
          )}
        </View>
      </Animated.View>
    </View>
  );
}
