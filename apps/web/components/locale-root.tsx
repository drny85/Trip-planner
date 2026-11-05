import { isLocale, parseAcceptLanguage, pickLocale } from "@trip/i18n";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { LOCALE_COOKIE, WebI18nProvider } from "./i18n";

/**
 * Picks the language from the saved choice, else the browser's Accept-Language.
 * It reads request data, so the root layout renders it inside <Suspense>.
 */
export async function LocaleRoot({ children }: { children: ReactNode }) {
  const [jar, hdrs] = await Promise.all([cookies(), headers()]);
  const tags = parseAcceptLanguage(hdrs.get("accept-language"));
  const saved = jar.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : pickLocale(tags);
  return (
    <WebI18nProvider initialLocale={locale} preferredTags={tags}>
      {children}
    </WebI18nProvider>
  );
}
