import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticMove, optimisticRemove } from "@trip/backend/optimistic";
import type { Activity, TripDetails } from "@trip/backend/types";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from "react-native";
import { Button } from "@/components/button";

type Props = { tripId: Id<"trips">; activityId: Id<"activities"> };

export function EditActivity({ tripId, activityId }: Props) {
  const trip = useQuery(api.trips.get, { tripId });
  const activity = trip?.subTrips.flatMap((s) => s.activities).find((a) => a._id === activityId);

  if (trip === undefined) return <ActivityIndicator className="mt-10" />;
  if (!trip || !activity) {
    return <Text className="m-6 text-muted-foreground">This activity was removed.</Text>;
  }
  // Keyed so the form resets if the activity changes underneath it.
  return <EditForm key={activity._id} trip={trip} activity={activity} />;
}

function EditForm({ trip, activity }: { trip: TripDetails; activity: Activity }) {
  const router = useRouter();
  const update = useMutation(api.activities.update);
  const move = useMutation(api.activities.move).withOptimisticUpdate(optimisticMove);
  const remove = useMutation(api.activities.remove).withOptimisticUpdate(optimisticRemove);

  const [form, setForm] = useState({
    title: activity.title,
    description: activity.description,
    startTime: activity.startTime ?? "",
    address: activity.address,
    phone: activity.phone ?? "",
    bookingUrl: activity.bookingUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const day = trip.subTrips.find((s) => s._id === activity.subTripId);
  const index = day?.activities.findIndex((a) => a._id === activity._id) ?? 0;
  const count = day?.activities.length ?? 0;

  const moveTo = (toSubTripId: Id<"subTrips">, toIndex: number) =>
    void move({ activityId: activity._id, toSubTripId, toIndex });

  const save = async () => {
    if (!form.title.trim()) return Alert.alert("Add a title");
    setSaving(true);
    try {
      await update({
        activityId: activity._id,
        patch: {
          title: form.title.trim(),
          description: form.description.trim(),
          address: form.address.trim(),
          startTime: form.startTime.trim() || undefined,
          phone: form.phone.trim() || undefined,
          bookingUrl: form.bookingUrl.trim() || undefined,
        },
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert("Delete this activity?", activity.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          router.back();
          void remove({ activityId: activity._id });
        },
      },
    ]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-5 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      <Field label="Title" value={form.title} onChangeText={set("title")} />
      <Field label="Description" value={form.description} onChangeText={set("description")} multiline />
      <View className="flex-row gap-3">
        <Field label="Start time" value={form.startTime} onChangeText={set("startTime")} placeholder="09:30" className="w-28" />
        <Field label="Phone" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" className="flex-1" />
      </View>
      <Field label="Address" value={form.address} onChangeText={set("address")} />
      <Field
        label="Reservation link"
        value={form.bookingUrl}
        onChangeText={set("bookingUrl")}
        placeholder="https://"
        autoCapitalize="none"
        keyboardType="url"
      />

      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">Order</Text>
        <View className="flex-row gap-2">
          <Button variant="secondary" size="sm" icon="up" disabled={index === 0} onPress={() => day && moveTo(day._id, index - 1)}>
            Earlier
          </Button>
          <Button variant="secondary" size="sm" icon="down" disabled={index >= count - 1} onPress={() => day && moveTo(day._id, index + 1)}>
            Later
          </Button>
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {trip.subTrips.map((s) => {
            const selected = s._id === activity.subTripId;
            return (
              <Pressable
                key={s._id}
                onPress={() => !selected && moveTo(s._id, s.activities.length)}
                className={cn("rounded-full border px-3 py-1.5", selected ? "border-primary bg-primary" : "border-border bg-card")}
              >
                <Text className={cn("text-sm font-semibold", selected ? "text-primary-foreground" : "text-foreground")}>
                  Day {s.dayNumber}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Button onPress={save} loading={saving} className="mt-2">
        Save changes
      </Button>
      <Button variant="danger" icon="trash" onPress={confirmDelete}>
        Delete activity
      </Button>
    </ScrollView>
  );
}

function Field({ label, className, multiline, ...props }: TextInputProps & { label: string; className?: string }) {
  return (
    <View className={cn("gap-1.5", className)}>
      <Text className="text-sm font-semibold text-muted-foreground">{label}</Text>
      <TextInput
        multiline={multiline}
        className={cn(
          "rounded-xl border border-border bg-card px-3 py-2.5 text-base text-foreground",
          multiline && "min-h-24",
        )}
        placeholderTextColorClassName="accent-muted-foreground"
        textAlignVertical={multiline ? "top" : "center"}
        {...props}
      />
    </View>
  );
}
