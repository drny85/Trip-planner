import { tokyoAdventure } from "@trip/backend/sample";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useState } from "react";
import { FlatList, Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LanguageAndTheme } from "@/screens/language";
import { Button } from "../button";
import { Icon } from "../icon";
import { LinearGradient } from "../gradient";
import { Image } from "../image";
import { SampleTrip } from "./sample-trip";

const activities = tokyoAdventure.subTrips.flatMap((d) => d.activities);
const photoOf = (title: string) => activities.find((a) => a.title.includes(title))?.photoUrl ?? tokyoAdventure.imageUrl!;

/** The four slides: a full-bleed photo from the sample trip, a headline and one line about a feature. */
const SLIDES = [
  { key: "plan", photo: tokyoAdventure.imageUrl!, emoji: "✨" },
  { key: "places", photo: photoOf("Senso-ji"), emoji: "📍" },
  { key: "today", photo: photoOf("Fushimi"), emoji: "🧭" },
  { key: "together", photo: photoOf("Arashiyama"), emoji: "👫" },
] as const;

/**
 * What a signed-out person sees first: a swipeable tour of the app over real
 * trip photos, a sample trip to browse, and sign-in only when they want to
 * plan their own.
 */
export function Welcome({ onSignIn, busy, error }: { onSignIn: () => void; busy: boolean; error: string | null }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      <FlatList
        data={SLIDES}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => (
          <View style={{ width, height }}>
            <Image source={item.photo} className="absolute inset-0" contentFit="cover" transition={300} />
            <LinearGradient
              colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)"]}
              locations={[0, 0.25, 0.55, 1]}
              className="absolute inset-0"
            />
            {i === index && (
              <Animated.View entering={FadeInDown.duration(450)} className="absolute inset-x-0 gap-3 px-7" style={{ bottom: insets.bottom + 210 }}>
                <Text className="text-4xl">{item.emoji}</Text>
                <Text className="text-[38px] font-extrabold leading-[42px] tracking-tight text-white">{t(`welcome.${item.key}Title`)}</Text>
                <Text className="text-lg leading-6 text-white/80">{t(`welcome.${item.key}Body`)}</Text>
              </Animated.View>
            )}
          </View>
        )}
      />

      <View className="absolute inset-x-0 top-0 flex-row items-center justify-between pl-7 pr-5" style={{ paddingTop: insets.top + 6 }} pointerEvents="box-none">
        <Text className="text-base font-extrabold tracking-tight text-white">{t("common.appName")}</Text>
        {/* Language and light/dark, before anyone has to sign in. */}
        <Pressable
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("mobile.titleSettings")}
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full bg-black/35 active:opacity-70"
        >
          <Icon name="globe" size={20} colorVar="--color-on-image" />
        </Pressable>
      </View>

      <View className="absolute inset-x-0 bottom-0 gap-4 px-6" style={{ paddingBottom: insets.bottom + 16 }}>
        <View className="flex-row justify-center gap-2" accessibilityRole="adjustable" accessibilityValue={{ min: 1, max: SLIDES.length, now: index + 1 }}>
          {SLIDES.map((s, i) => (
            <View key={s.key} className={cn("h-2 rounded-full", i === index ? "w-6 bg-white" : "w-2 bg-white/40")} />
          ))}
        </View>
        <Button variant="light" icon="sparkles" onPress={onSignIn} loading={busy}>
          {t("welcome.getStarted")}
        </Button>
        <Button variant="glass" icon="route" onPress={() => setSampleOpen(true)}>
          {t("welcome.exploreSample")}
        </Button>
        {error && <Text className="text-center text-sm text-white">{error}</Text>}
      </View>

      <Modal visible={settingsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSettingsOpen(false)}>
        <LanguageAndTheme onPickLanguage={() => setSettingsOpen(false)} onClose={() => setSettingsOpen(false)} />
      </Modal>

      <SampleTrip
        visible={sampleOpen}
        onClose={() => setSampleOpen(false)}
        onSignIn={() => {
          setSampleOpen(false);
          onSignIn();
        }}
      />
    </View>
  );
}
