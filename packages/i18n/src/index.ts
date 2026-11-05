export { createFormat, type Format } from "./format";
export { defaultLocale, formatTagFor, isLocale, languageInEnglish, localeNames, locales, parseAcceptLanguage, pickLocale, toLocale, type Locale } from "./locales";
export { en, messages, type MessageKey, type Messages } from "./messages";
export { createTranslator, type Plural, type Vars } from "./translate";

import { en, messages } from "./messages";
import type { Locale } from "./locales";
import { createTranslator } from "./translate";

/** A plain `t` for code outside React (the backend, notifications). */
export const translator = (locale: Locale) => createTranslator(locale, messages[locale], en);
export { notificationText, type NotificationKind, type NotificationParams } from "./notifications";
