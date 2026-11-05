import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { callPhone, openInAppBrowser } from "@/lib/open";

type Details = NonNullable<FunctionReturnType<typeof api.places.details>>;

/** Loads the place's live Google details once when the screen opens; null when there are none. */
function useDetails(activityId: Id<"activities">) {
  const load = useAction(api.places.details);
  const [details, setDetails] = useState<Details | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    load({ activityId })
      .then((d) => live && setDetails(d))
      .catch(() => live && setDetails(null));
    return () => {
      live = false;
    };
  }, [activityId, load]);
  return details;
}

/** Rating, price, open now, hours, phone and website from Google Maps, at the top of an activity. */
export function PlaceInfo({ activityId }: { activityId: Id<"activities"> }) {
  const details = useDetails(activityId);
  const [showHours, setShowHours] = useState(false);
  const { t, f } = useI18n();
  if (!details) return null; // Loading, no Google key, or no match: nothing to show.

  const status = statusLine(details, t, f);
  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("place.heading")}</Text>

      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {details.rating !== undefined && (
          <Text className="text-base font-bold text-foreground">
            <Text className="text-amber-500">{stars(details.rating)}</Text> {f.number(details.rating)}
            {details.ratingCount ? (
              <Text className="text-sm font-normal text-muted-foreground"> · {t("place.reviews", { count: details.ratingCount })}</Text>
            ) : null}
          </Text>
        )}
        {details.priceLevel ? <Text className="text-base font-semibold text-muted-foreground">{"$".repeat(details.priceLevel)}</Text> : null}
      </View>

      {status && (
        <Pressable onPress={() => details.weekHours?.length && setShowHours((v) => !v)} accessibilityRole="button" disabled={!details.weekHours?.length}>
          <Text className={cn("text-sm font-semibold", status.tone === "good" ? "text-success" : "text-danger")}>
            {status.text}
            {details.weekHours?.length ? <Text className="font-normal text-muted-foreground"> · {t("place.hours")} {showHours ? "▴" : "▾"}</Text> : null}
          </Text>
        </Pressable>
      )}
      {showHours && details.weekHours && (
        <View className="gap-0.5">
          {details.weekHours.map((line) => (
            <Text key={line} className="text-sm text-muted-foreground">
              {line}
            </Text>
          ))}
        </View>
      )}

      {details.summary ? <Text className="text-sm text-foreground">{details.summary}</Text> : null}

      <View className="flex-row flex-wrap gap-2">
        {details.phone && <Chip label={`📞 ${details.phone}`} onPress={() => void callPhone(details.phone!)} />}
        {details.website && <Chip label={`🌐 ${t("activity.website")}`} onPress={() => void openInAppBrowser(details.website!)} />}
        {details.mapsUrl && <Chip label={`📍 ${t("place.openInMaps")}`} onPress={() => void Linking.openURL(details.mapsUrl!)} />}
      </View>
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" className="rounded-full bg-muted px-3 py-1.5 active:opacity-70">
      <Text className="text-sm font-semibold text-foreground">{label}</Text>
    </Pressable>
  );
}

/** "★★★★☆" for 4.3: full stars, rounded to the nearest whole. */
const stars = (rating: number) => {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
};

type I18n = ReturnType<typeof useI18n>;

function statusLine(d: Details, t: I18n["t"], f: I18n["f"]): { text: string; tone: "good" | "bad" } | null {
  if (d.status === "closedPermanently") return { text: t("place.closedPermanently"), tone: "bad" };
  if (d.status === "closedTemporarily") return { text: t("place.closedTemporarily"), tone: "bad" };
  if (d.openNow === undefined) return null;
  const next = d.nextChange ? f.time(d.nextChange) : undefined;
  if (d.openNow) return { text: next ? `${t("place.openNow")} · ${t("place.closesAt", { time: next })}` : t("place.openNow"), tone: "good" };
  return { text: next ? `${t("place.closedNow")} · ${t("place.opensAt", { time: next })}` : t("place.closedNow"), tone: "bad" };
}
