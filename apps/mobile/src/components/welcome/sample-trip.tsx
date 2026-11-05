import { tokyoAdventure } from "@trip/backend/sample";
import { useI18n } from "@trip/i18n/react";
import { dayTitle, getCategory } from "@trip/ui";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../button";
import { LinearGradient } from "../gradient";
import { Image } from "../image";

/**
 * A read-only look at a finished trip (the Tokyo sample), so people can see what
 * they'll get before making an account. Built from static data: no backend.
 */
export function SampleTrip({ visible, onClose, onSignIn }: { visible: boolean; onClose: () => void; onSignIn: () => void }) {
  const insets = useSafeAreaInsets();
  const { t, f } = useI18n();
  const trip = tokyoAdventure;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background">
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
          <View className="h-80">
            <Image source={trip.imageUrl} className="absolute inset-0" contentFit="cover" />
            <LinearGradient colors={["rgba(0,0,0,0.25)", "rgba(0,0,0,0)", "rgba(0,0,0,0.8)"]} className="absolute inset-0" />
            <View className="absolute inset-x-0 bottom-0 gap-1 p-5">
              <Text className="self-start rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold uppercase tracking-widest text-white">
                {t("welcome.sampleBadge")}
              </Text>
              <Text className="text-3xl font-extrabold tracking-tight text-white">{trip.title}</Text>
              <Text className="text-base text-white/85">
                {trip.destination} · {f.dateRange(trip.startDate!, trip.endDate!)}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              hitSlop={10}
              className="absolute right-4 top-4 h-9 w-9 items-center justify-center rounded-full bg-black/45"
            >
              <Text className="text-lg font-bold text-white">✕</Text>
            </Pressable>
          </View>

          <Text className="px-5 pt-5 text-base leading-6 text-muted-foreground">{trip.description}</Text>

          {trip.subTrips.map((day) => (
            <View key={day.dayNumber} className="gap-3 pt-7">
              <View className="px-5">
                <Text className="text-xs font-bold uppercase tracking-widest text-primary">
                  {t("time.dayN", { day: day.dayNumber })}
                  {day.date ? ` · ${f.weekday(day.date)}` : ""}
                </Text>
                <Text className="text-2xl font-extrabold tracking-tight text-foreground">{dayTitle(day.title)}</Text>
              </View>
              {day.activities.map((a) => {
                const category = getCategory(a.category);
                return (
                  <View key={a.title} className="mx-4 flex-row overflow-hidden rounded-2xl bg-card">
                    <Image source={a.photoUrl} className="h-24 w-24" contentFit="cover" />
                    <View className="flex-1 gap-0.5 p-3">
                      <Text className="text-xs font-semibold text-muted-foreground">
                        {category.emoji} {a.startTime ? f.time(a.startTime) : ""}
                        {a.durationMinutes ? ` · ${f.duration(a.durationMinutes)}` : ""}
                      </Text>
                      <Text className="text-base font-bold text-foreground" numberOfLines={1}>
                        {a.title}
                      </Text>
                      <Text className="text-sm text-muted-foreground" numberOfLines={2}>
                        {a.description}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View className="absolute inset-x-0 bottom-0 gap-1 border-t border-border bg-background px-5 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <Button icon="sparkles" onPress={onSignIn}>
            {t("welcome.planYourOwn")}
          </Button>
          <Text className="text-center text-xs text-muted-foreground">{t("welcome.freeNote")}</Text>
        </View>
      </View>
    </Modal>
  );
}
