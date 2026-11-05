import { localeNames, locales, pickLocale, type Locale } from "@trip/i18n";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useLocales } from "expo-localization";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useAppLanguage } from "@/lib/i18n";
import { setThemeChoice, useThemeChoice, type ThemeChoice } from "@/lib/theme";

/** The language sheet route: language and light/dark, from the trips list. */
export function LanguageScreen() {
  const router = useRouter();
  return <LanguageAndTheme onPickLanguage={() => router.back()} onClose={() => router.back()} />;
}

const THEMES: { value: ThemeChoice; key: "mobile.themeSystem" | "mobile.themeLight" | "mobile.themeDark" }[] = [
  { value: "system", key: "mobile.themeSystem" },
  { value: "light", key: "mobile.themeLight" },
  { value: "dark", key: "mobile.themeDark" },
];

/**
 * Pick the app language (or follow the phone's) and the theme. Also shown on the
 * welcome tour, before sign-in. `onPickLanguage` runs after a language is chosen.
 */
export function LanguageAndTheme({ onPickLanguage, onClose }: { onPickLanguage?: () => void; onClose?: () => void }) {
  const { t } = useI18n();
  const device = pickLocale(useLocales().map((l) => l.languageTag));
  const { choice, setChoice } = useAppLanguage();
  const theme = useThemeChoice();

  const pick = (next: Locale | null) => {
    setChoice(next);
    onPickLanguage?.();
  };

  return (
    // The sheet has no native header: on a form sheet it drew over the first row.
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-2 p-4 pt-6 pb-16">
      <View className="mb-2 flex-row items-center justify-between px-2">
        <Text accessibilityRole="header" className="flex-1 text-2xl font-bold text-foreground">
          {t("mobile.titleSettings")}
        </Text>
        {onClose && (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            hitSlop={10}
            className="h-9 w-9 items-center justify-center rounded-full bg-muted active:opacity-70"
          >
            <Text className="text-base font-bold text-foreground">✕</Text>
          </Pressable>
        )}
      </View>

      <Text className="px-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("mobile.appearance")}</Text>
      <View className="flex-row gap-1 rounded-2xl bg-card p-1" accessibilityRole="radiogroup">
        {THEMES.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => setThemeChoice(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: theme === o.value }}
            className={cn("flex-1 items-center rounded-xl py-2.5 active:opacity-70", theme === o.value && "bg-primary")}
          >
            <Text className={cn("text-sm font-semibold", theme === o.value ? "text-primary-foreground" : "text-foreground")}>{t(o.key)}</Text>
          </Pressable>
        ))}
      </View>

      <Text className="mt-4 px-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("mobile.titleLanguage")}</Text>
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
