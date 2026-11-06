import { deDE, enUS, esMX, frFR, jaJP, ptBR } from "@clerk/localizations";
import type { Locale } from "@trip/i18n";
import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

type ClerkProps = ComponentProps<typeof ClerkProvider>;

/**
 * Clerk's sign-in, sign-up and account screens drawn with the app's own tokens. The colors
 * are CSS variables, so light and dark mode follow globals.css with no extra theme.
 */
export const clerkAppearance: ClerkProps["appearance"] = {
  // Tailwind v4 utilities must win over Clerk's styles; the layer order is set in globals.css.
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorBackground: "var(--card)",
    colorForeground: "var(--foreground)",
    colorMutedForeground: "var(--muted-foreground)",
    colorMuted: "var(--muted)",
    colorInput: "var(--background)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorRing: "var(--primary)",
    colorDanger: "var(--danger)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--accent)",
    colorModalBackdrop: "rgb(2 6 23 / 0.55)",
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
    borderRadius: "0.85rem",
  },
  elements: {
    modalBackdrop: "backdrop-blur-sm",
    cardBox: "rounded-3xl border border-border shadow-2xl shadow-primary/10",
    headerTitle: "text-2xl font-extrabold tracking-tight",
    formButtonPrimary: "rounded-full py-2.5 font-semibold shadow-lg shadow-primary/25 transition active:scale-[0.98]",
    socialButtonsBlockButton: "rounded-full transition hover:bg-muted",
    socialButtonsIconButton: "rounded-full",
    formFieldInput: "rounded-xl",
    footerActionLink: "font-semibold text-primary",
  },
};

/** Clerk's own copy (labels, errors, emails) in the language the app is showing. */
export const clerkLocalization: Record<Locale, ClerkProps["localization"]> = {
  en: enUS,
  es: esMX,
  fr: frFR,
  pt: ptBR,
  de: deDE,
  ja: jaJP,
};
