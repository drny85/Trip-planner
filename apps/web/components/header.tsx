"use client";

import { useI18n } from "@trip/i18n/react";
import Link from "next/link";
import { AccountButton } from "./auth";
import { LanguagePicker } from "./i18n";
import { NotificationBell } from "./notification-bell";

export function Header() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="group flex items-center gap-2 whitespace-nowrap text-lg font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground shadow-md shadow-primary/30 transition-transform group-hover:-rotate-12">
            ✈
          </span>
          <span className="max-[420px]:sr-only">{t("common.appName")}</span>
        </Link>
        <nav className="flex items-center gap-3 whitespace-nowrap text-sm font-medium sm:gap-4">
          <Link href="/trips" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline">
            {t("nav.myTrips")}
          </Link>
          <Link
            href="/trips/new"
            className="rounded-full bg-foreground px-4 py-2 text-background transition hover:opacity-90 active:scale-[0.97]"
          >
            {t("nav.planWithAI")}
          </Link>
          <LanguagePicker />
          <NotificationBell />
          <AccountButton />
        </nav>
      </div>
    </header>
  );
}
