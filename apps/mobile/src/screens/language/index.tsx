import { localeNames, locales, pickLocale, type Locale } from "@trip/i18n";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useLocales } from "expo-localization";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useAppLanguage } from "@/lib/i18n";

/** Pick the app language, or follow the phone's. */
export function LanguageScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const device = pickLocale(useLocales().map((l) => l.languageTag));
  const { choice, setChoice } = useAppLanguage();

  const pick = (next: Locale | null) => {
    setChoice(next);
    router.back();
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-2 p-4 pb-16">
      <Row selected={choice === null} title={t("mobile.useDevice")} hint={t("mobile.useDeviceHint", { language: localeNames[device] })} onPress={() => pick(null)} />
      <View className="h-2" />
      {locales.map((l) => (
        <Row key={l} selected={choice === l} title={localeNames[l]} onPress={() => pick(l)} />
      ))}
      <Text className="mt-3 px-2 text-xs text-muted-foreground">{t("mobile.languageNote")}</Text>
    </ScrollView>
  );
}

function Row({ selected, title, hint, onPress }: { selected: boolean; title: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={cn("flex-row items-center gap-3 rounded-2xl px-4 py-3.5 active:opacity-70", selected ? "bg-primary/10" : "bg-card")}
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-foreground">{title}</Text>
        {hint ? <Text className="mt-0.5 text-xs text-muted-foreground">{hint}</Text> : null}
      </View>
      {selected && <Text className="text-lg font-bold text-primary">✓</Text>}
    </Pressable>
  );
}
