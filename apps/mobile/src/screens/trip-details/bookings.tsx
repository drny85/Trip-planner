import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n, type I18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { createContext, useContext, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Button } from "@/components/button";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { EASE_IN_OUT, EASE_OUT } from "@/lib/motion";
import { openInAppBrowser } from "@/lib/open";

/**
 * Bookings on the trip page: imports waiting for review, and the confirmations
 * already added. The import sheet itself is screens/import-booking.
 */
type Data = NonNullable<FunctionReturnType<typeof api.bookings.forTrip>>;
type Booking = Data["bookings"][number];
type Import = Data["imports"][number];
type Day = { _id: Id<"subTrips">; dayNumber: number; date?: string; activities: { _id: Id<"activities">; title: string }[] };

export const KIND_EMOJI: Record<Booking["kind"], string> = {
  flight: "✈️",
  train: "🚆",
  bus: "🚌",
  ferry: "⛴️",
  car: "🚗",
  hotel: "🏨",
  restaurant: "🍽️",
  tour: "🎟️",
  event: "🎭",
  other: "📄",
};

const Ctx = createContext<{ data: Data | null | undefined; byActivity: Map<string, Booking> }>({ data: undefined, byActivity: new Map() });

export function BookingsProvider({ tripId, children }: { tripId: Id<"trips">; children: React.ReactNode }) {
  const data = useCachedQuery(api.bookings.forTrip, { tripId }).data;
  const value = useMemo(() => {
    const byActivity = new Map<string, Booking>();
    for (const b of data?.bookings ?? []) if (b.activityId) byActivity.set(b.activityId, b);
    return { data, byActivity };
  }, [data]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The booking filed under an activity, for the "Booked" pill on its card. */
export const useBookingFor = (activityId: string) => useContext(Ctx).byActivity.get(activityId);

const when = (f: I18n["f"], b: { startDate?: string; startTime?: string }) => [b.startDate && f.day(b.startDate), b.startTime && f.time(b.startTime)].filter(Boolean).join(" · ");

export function BookingsSection({ tripId, days }: { tripId: Id<"trips">; days: Day[] }) {
  const { t } = useI18n();
  const { data } = useContext(Ctx);
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  if (!data) return null;
  const { bookings, imports } = data;
  const shown = showAll ? bookings : bookings.slice(0, 4);

  return (
    <View className="mt-6 gap-3 px-4">
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">{t("bookings.eyebrow")}</Text>
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">{t("bookings.title")}</Text>
          <Text className="text-xs text-muted-foreground">
            {bookings.length ? `${t("bookings.confirmed", { count: bookings.length })} · ` : ""}{t("bookings.intro")}
          </Text>
        </View>
        <Button size="sm" icon="plus" onPress={() => router.push({ pathname: "/trips/[tripId]/import", params: { tripId } })}>
          {t("bookings.importShort")}
        </Button>
      </View>

      {imports.map((imp) => (
        <Animated.View key={`${imp._id}-${imp.status}`} entering={FadeIn.duration(200).easing(EASE_OUT)} exiting={FadeOut.duration(150)} layout={LinearTransition.duration(240).easing(EASE_IN_OUT)}>
          <ImportCard imp={imp} days={days} />
        </Animated.View>
      ))}

      {bookings.length > 0 && (
        <View className="rounded-3xl bg-card px-4 py-1 shadow-sm shadow-black/5">
          {shown.map((b) => (
            <SavedBooking key={b._id} booking={b} />
          ))}
          {bookings.length > 4 && (
            <Pressable onPress={() => setShowAll((s) => !s)} className="py-3">
              <Text className="text-sm font-semibold text-primary">{showAll ? t("bookings.showFewer") : t("bookings.showAll", { count: bookings.length })}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function SavedBooking({ booking: b }: { booking: Booking }) {
  const { t, f } = useI18n();
  const remove = useMutation(api.bookings.remove);
  const onLongPress = () =>
    Alert.alert(b.title, b.confirmationCode ? t("bookings.confirmation", { code: b.confirmationCode }) : undefined, [
      ...(b.bookingUrl ? [{ text: t("bookings.manageBooking"), onPress: () => void openInAppBrowser(b.bookingUrl!) }] : []),
      { text: t("bookings.removeBooking"), style: "destructive" as const, onPress: () => void remove({ bookingId: b._id }) },
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  return (
    <Pressable onLongPress={onLongPress} onPress={b.bookingUrl ? () => void openInAppBrowser(b.bookingUrl!) : undefined} className="flex-row items-center gap-3 border-b border-border/60 py-3">
      <Text className="text-xl">{KIND_EMOJI[b.kind]}</Text>
      <View className="flex-1">
        <Text className="font-semibold text-foreground" numberOfLines={1}>
          {b.title}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {[when(f, b), b.provider, b.details].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {b.confirmationCode && (
        // Selectable, so a long press copies the code.
        <Text selectable className="rounded-lg bg-muted px-2 py-1 font-mono text-xs font-semibold text-foreground">
          {b.confirmationCode}
        </Text>
      )}
    </Pressable>
  );
}

type Choice = { include: boolean; subTripId?: Id<"subTrips">; activityId?: Id<"activities"> };

function ImportCard({ imp, days }: { imp: Import; days: Day[] }) {
  const { t } = useI18n();
  const dismiss = useMutation(api.bookings.dismiss);
  const label = imp.source === "email" ? (imp.subject ?? t("bookings.forwarded")) : (imp.fileName ?? t("bookings.pasted"));

  if (imp.status === "processing")
    return (
      <View className="flex-row items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
        <ActivityIndicator />
        <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
          <Text className="font-semibold">{t("bookings.reading")} </Text>
          <Text className="text-muted-foreground">{label}</Text>
        </Text>
      </View>
    );

  if (imp.status === "failed")
    return (
      <View className="flex-row items-center gap-3 rounded-2xl bg-danger/10 p-4">
        <Text className="flex-1 text-sm font-semibold text-danger">{imp.error ?? t("bookings.errRefused")}</Text>
        <Button size="sm" variant="secondary" onPress={() => void dismiss({ importId: imp._id })}>
          {t("bookings.dismiss")}
        </Button>
      </View>
    );

  return <ReadyImport imp={imp} days={days} label={label} />;
}

function ReadyImport({ imp, days, label }: { imp: Import; days: Day[]; label: string }) {
  const { t, f } = useI18n();
  const apply = useMutation(api.bookings.apply);
  const dismiss = useMutation(api.bookings.dismiss);
  const proposals = imp.proposals ?? [];
  const [choices, setChoices] = useState<Choice[]>(() =>
    proposals.map((p) => ({ include: true, subTripId: p.placement.subTripId ?? days[0]?._id, activityId: p.placement.activityId })),
  );
  const [busy, setBusy] = useState(false);
  const picked = choices.filter((c) => c.include && c.subTripId).length;

  return (
    <View className="gap-3 rounded-3xl border border-primary/30 bg-primary/5 p-4">
      <Text className="text-sm text-foreground">
        <Text className="font-semibold">{t("bookings.found", { count: proposals.length })}</Text>
        <Text className="text-muted-foreground"> {t("bookings.checkWhere", { source: label })}</Text>
      </Text>
      {proposals.map(({ booking: b, placement }, i) => {
        const c = choices[i];
        if (!c) return null;
        const set = (patch: Partial<Choice>) => setChoices((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        const day = days.find((d) => d._id === c.subTripId);
        const attachedTo = c.activityId ? day?.activities.find((a) => a._id === c.activityId) : undefined;
        return (
          <View key={i} className={cn("gap-2 rounded-2xl bg-card p-3", !c.include && "opacity-50")}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: c.include }}
              onPress={() => {
                void Haptics.selectionAsync();
                set({ include: !c.include });
              }}
              className="flex-row items-start gap-3"
            >
              <View className={cn("mt-0.5 h-6 w-6 items-center justify-center rounded-lg border-2", c.include ? "border-primary bg-primary" : "border-border")}>
                {c.include && <Text className="text-xs font-bold text-primary-foreground">✓</Text>}
              </View>
              <Text className="text-xl">{KIND_EMOJI[b.kind]}</Text>
              <View className="flex-1">
                <Text className="font-semibold text-foreground">{b.title}</Text>
                <Text className="text-xs text-muted-foreground">{[when(f, b), b.confirmationCode && `#${b.confirmationCode}`, b.provider].filter(Boolean).join(" · ")}</Text>
              </View>
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5">
              {days.map((d) => {
                const on = d._id === c.subTripId;
                return (
                  <Pressable
                    key={d._id}
                    onPress={() => set({ subTripId: d._id, activityId: d._id === placement.subTripId ? placement.activityId : undefined })}
                    className={cn("rounded-full border px-3 py-1", on ? "border-primary bg-primary" : "border-border bg-background")}
                  >
                    <Text className={cn("text-xs font-semibold", on ? "text-primary-foreground" : "text-foreground")}>
                      {t("time.dayN", { day: d.dayNumber })}
                      {d.date ? ` · ${f.day(d.date)}` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text className="text-xs text-muted-foreground">
              {attachedTo ? (
                <>
                  {t("bookings.addsTo", { title: attachedTo.title })}{" "}
                  <Text onPress={() => set({ activityId: undefined })} className="font-semibold text-primary">
                    {t("bookings.newInstead")}
                  </Text>
                </>
              ) : (
                b.startTime ? t("bookings.newStopAt", { time: f.time(b.startTime) }) : t("bookings.newStop")
              )}
              {placement.outsideTrip && c.subTripId === placement.subTripId ? `  ·  ${t("bookings.outside")}` : ""}
            </Text>
          </View>
        );
      })}
      <View className="flex-row gap-2">
        <Button variant="secondary" onPress={() => void dismiss({ importId: imp._id })}>
          {t("bookings.dismiss")}
        </Button>
        <Button
          containerClassName="flex-1"
          loading={busy}
          disabled={picked === 0}
          onPress={async () => {
            setBusy(true);
            try {
              await apply({
                importId: imp._id,
                items: choices.flatMap((c, index) => (c.include && c.subTripId ? [{ index, subTripId: c.subTripId, activityId: c.activityId }] : [])),
              });
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {
              Alert.alert(t("bookings.couldntAdd"), e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : undefined);
              setBusy(false);
            }
          }}
        >
          {t("bookings.add", { count: picked })}
        </Button>
      </View>
    </View>
  );
}
