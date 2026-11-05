import { isLocale, pickLocale, type Locale } from "@trip/i18n";
import { buildI18n, I18nProvider, type I18n } from "@trip/i18n/react";
import { useLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, Settings } from "react-native";

/**
 * The app language: the one picked in the app if any, otherwise the phone's
 * (iOS and Android also offer a per-app language in Settings, which shows up
 * here as the device language). Kept outside the offline cache, so signing out
 * doesn't reset it.
 */
const KEY = "app-language";

function readSaved(): Locale | null {
  try {
    const value = Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) : SecureStore.getItem(KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function writeSaved(locale: Locale | null) {
  try {
    if (Platform.OS === "web") {
      if (locale) globalThis.localStorage?.setItem(KEY, locale);
      else globalThis.localStorage?.removeItem(KEY);
    } else if (locale) SecureStore.setItem(KEY, locale);
    else void SecureStore.deleteItemAsync(KEY);
    // iOS's own per-app language, which native screens (Clerk's sign-in sheet, system
    // dialogs) read. It takes effect the next time the app launches; null follows the phone.
    if (Platform.OS === "ios") Settings.set({ AppleLanguages: locale ? [locale] : null });
  } catch {
    // Not saved; it still applies until the app restarts.
  }
}

const holder: { current: I18n } = { current: buildI18n("en") };

/** The translator for code outside React (local reminders, share sheets). */
export const i18nNow = () => holder.current;

type Choice = { choice: Locale | null; setChoice: (locale: Locale | null) => void };
const ChoiceContext = createContext<Choice>({ choice: null, setChoice: () => {} });

/** The language picked in the app (null = follow the phone) and a setter, for the language screen. */
export const useAppLanguage = () => useContext(ChoiceContext);

export function MobileI18nProvider({ children }: { children: ReactNode }) {
  const deviceLocales = useLocales();
  const tags = useMemo(() => deviceLocales.map((l) => l.languageTag), [deviceLocales]);
  const [choice, setChoiceState] = useState<Locale | null>(readSaved);
  const locale = choice ?? pickLocale(tags);

  const setChoice = useCallback((next: Locale | null) => {
    writeSaved(next);
    setChoiceState(next);
  }, []);
  const choiceValue = useMemo(() => ({ choice, setChoice }), [choice, setChoice]);

  useEffect(() => {
    holder.current = buildI18n(locale, tags, setChoice);
  }, [locale, tags, setChoice]);

  return (
    <ChoiceContext.Provider value={choiceValue}>
      <I18nProvider locale={locale} preferredTags={tags} onLocaleChange={setChoice}>
        {children}
      </I18nProvider>
    </ChoiceContext.Provider>
  );
}
