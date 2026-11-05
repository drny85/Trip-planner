import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { cn, formatDay, formatTime } from "@trip/ui";
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

const when = (b: { startDate?: string; startTime?: string }) => [b.startDate && formatDay(b.startDate), b.startTime && formatTime(b.startTime)].filter(Boolean).join(" · ");

export function BookingsSection({ tripId, days }: { tripId: Id<"trips">; days: Day[] }) {
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
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">Flights, stays & tables</Text>
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">Bookings</Text>
          <Text className="text-xs text-muted-foreground">
            {bookings.length ? `${bookings.length} confirmed · ` : ""}AI files confirmations into the right day
          </Text>
        </View>
        <Button size="sm" icon="plus" onPress={() => router.push({ pathname: "/trips/[tripId]/import", params: { tripId } })}>
          Import
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
              <Text className="text-sm font-semibold text-primary">{showAll ? "Show fewer" : `Show all ${bookings.length}`}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function SavedBooking({ booking: b }: { booking: Booking }) {
  const remove = useMutation(api.bookings.remove);
  const onLongPress = () =>
    Alert.alert(b.title, b.confirmationCode ? `Confirmation ${b.confirmationCode}` : undefined, [
      ...(b.bookingUrl ? [{ text: "Manage booking", onPress: () => void openInAppBrowser(b.bookingUrl!) }] : []),
      { text: "Remove booking", style: "destructive" as const, onPress: () => void remove({ bookingId: b._id }) },
      { text: "Cancel", style: "cancel" as const },
    ]);
  return (
    <Pressable onLongPress={onLongPress} onPress={b.bookingUrl ? () => void openInAppBrowser(b.bookingUrl!) : undefined} className="flex-row items-center gap-3 border-b border-border/60 py-3">
      <Text className="text-xl">{KIND_EMOJI[b.kind]}</Text>
      <View className="flex-1">
        <Text className="font-semibold text-foreground" numberOfLines={1}>
          {b.title}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {[when(b), b.provider, b.details].filter(Boolean).join(" · ")}
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
  const dismiss = useMutation(api.bookings.dismiss);
  const label = imp.source === "email" ? (imp.subject ?? "Forwarded email") : (imp.fileName ?? "Pasted confirmation");

  if (imp.status === "processing")
    return (
      <View className="flex-row items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
        <ActivityIndicator />
        <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
          <Text className="font-semibold">Reading your booking… </Text>
          <Text className="text-muted-foreground">{label}</Text>
        </Text>
      </View>
    );

  if (imp.status === "failed")
    return (
      <View className="flex-row items-center gap-3 rounded-2xl bg-danger/10 p-4">
        <Text className="flex-1 text-sm font-semibold text-danger">{imp.error ?? "Couldn't read that confirmation."}</Text>
        <Button size="sm" variant="secondary" onPress={() => void dismiss({ importId: imp._id })}>
          Dismiss
        </Button>
      </View>
    );

  return <ReadyImport imp={imp} days={days} label={label} />;
}

function ReadyImport({ imp, days, label }: { imp: Import; days: Day[]; label: string }) {
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
        <Text className="font-semibold">
          Found {proposals.length} booking{proposals.length === 1 ? "" : "s"}
        </Text>
        <Text className="text-muted-foreground"> in {label}. Check where each one goes.</Text>
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
                <Text className="text-xs text-muted-foreground">{[when(b), b.confirmationCode && `#${b.confirmationCode}`, b.provider].filter(Boolean).join(" · ")}</Text>
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
                      Day {d.dayNumber}
                      {d.date ? ` · ${formatDay(d.date)}` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text className="text-xs text-muted-foreground">
              {attachedTo ? (
                <>
                  Adds to <Text className="font-semibold text-foreground">{attachedTo.title}</Text>.{" "}
                  <Text onPress={() => set({ activityId: undefined })} className="font-semibold text-primary">
                    New stop instead
                  </Text>
                </>
              ) : (
                `As a new stop${b.startTime ? ` at ${formatTime(b.startTime)}` : ""}`
              )}
              {placement.outsideTrip && c.subTripId === placement.subTripId ? "  ·  Outside the trip dates" : ""}
            </Text>
          </View>
        );
      })}
      <View className="flex-row gap-2">
        <Button variant="secondary" onPress={() => void dismiss({ importId: imp._id })}>
          Dismiss
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
              Alert.alert("Couldn't add those bookings", e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : undefined);
              setBusy(false);
            }
          }}
        >
          {`Add ${picked} to the trip`}
        </Button>
      </View>
    </View>
  );
}
