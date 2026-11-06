import { useI18n } from "@trip/i18n/react";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Icon } from "@/components/icon";

const STATUS = ["status1", "status2", "status3", "status4", "status5"] as const;

/** Shown while Claude plans: a breathing orb and rotating status lines. */
export function Planning() {
  const [step, setStep] = useState(0);
  const { t } = useI18n();
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % STATUS.length), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <Animated.View entering={FadeIn.duration(250)} className="items-center gap-5 py-6">
      <View className="h-28 w-28 items-center justify-center">
        <Animated.View
          className="absolute h-28 w-28 rounded-full bg-primary/20"
          style={{
            animationName: { from: { transform: [{ scale: 0.85 }], opacity: 0.9 }, to: { transform: [{ scale: 1.15 }], opacity: 0.3 } },
            animationDuration: 1400,
            animationIterationCount: "infinite",
            animationDirection: "alternate",
            animationTimingFunction: "ease-in-out",
          }}
        />
        <View className="h-16 w-16 items-center justify-center rounded-full bg-primary">
          <Icon name="sparkles" size={28} colorVar="--color-primary-foreground" />
        </View>
      </View>
      <Animated.Text
        key={step}
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
        className="text-lg font-semibold text-foreground"
      >
        {t(`generate.${STATUS[step]!}`)}
      </Animated.Text>
      <Text className="text-sm text-muted-foreground">{t("generate.usuallyTakes")}</Text>
    </Animated.View>
  );
}
