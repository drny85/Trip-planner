"use client";

import { SignInButton } from "@clerk/nextjs";
import { api } from "@trip/backend/api";
import { useI18n } from "@trip/i18n/react";
import { useMutation, useQuery } from "convex/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";
import { SmartImage } from "./smart-image";

/** The invite link's page: a postcard of the trip with a Join button. */
export function JoinTrip({ token }: { token: string }) {
  const preview = useQuery(api.members.invitePreview, { token });
  const join = useMutation(api.members.join);
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const { t, f } = useI18n();

  if (preview === undefined) return <div className="mx-auto mt-24 h-96 max-w-lg animate-pulse rounded-3xl bg-muted" />;
  if (preview === null)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
        <span className="text-5xl">🔗</span>
        <h1 className="text-2xl font-bold">{t("join.inactiveTitle")}</h1>
        <p className="text-muted-foreground">{t("join.inactiveBody")}</p>
      </div>
    );

  const onJoin = async () => {
    setJoining(true);
    try {
      const tripId = await join({ token });
      router.push(`/trips/${tripId}`);
    } finally {
      setJoining(false);
    }
  };
  const others = preview.memberNames.slice(1);

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:py-20">
      <motion.div
        initial={{ opacity: 0, y: 24, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
        className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl shadow-black/10"
      >
        <div className="relative h-60">
          <SmartImage src={preview.imageUrl} seed={preview.destination} emoji="🌏" className="absolute inset-0" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute bottom-5 left-6 right-6 text-white">
            <p className="text-sm font-semibold opacity-80">📍 {preview.destination}</p>
            <h1 className="text-3xl font-extrabold tracking-tight">{preview.title}</h1>
            <p className="text-sm opacity-80">{f.dateRange(preview.startDate, preview.endDate)}</p>
          </div>
        </div>
        <div className="flex flex-col gap-5 p-6">
          <motion.p {...rise(1)} className="text-lg">
            <span className="font-bold">{t("join.invited", { name: preview.ownerName })}</span>
            {others.length > 0 && (
              <span className="text-muted-foreground">
                {" "}
                {t("join.with", { names: others.slice(0, 3).join(", ") })}
                {others.length > 3 ? ` ${t("join.andMore", { count: others.length - 3 })}` : ""}
              </span>
            )}
            .
          </motion.p>
          <motion.ul {...rise(2)} className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>✅ {t("join.perk1")}</li>
            <li>💡 {t("join.perk2")}</li>
            <li>🗳️ {t("join.perk3")}</li>
          </motion.ul>
          <motion.div {...rise(3)}>
            {preview.alreadyMember ? (
              <Link href={`/trips/${preview.tripId}`} className="block rounded-full bg-primary py-3 text-center font-semibold text-primary-foreground">
                {t("join.youreIn")} →
              </Link>
            ) : preview.signedIn ? (
              <button
                onClick={() => void onJoin()}
                disabled={joining}
                className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {joining ? t("join.joining") : t("join.join")}
              </button>
            ) : (
              <SignInButton mode="modal">
                <button className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/25">{t("join.signInToJoin")}</button>
              </SignInButton>
            )}
          </motion.div>
        </div>
      </motion.div>
    </main>
  );
}
