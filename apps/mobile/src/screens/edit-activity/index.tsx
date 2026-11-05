import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticMove, optimisticRemove } from "@trip/backend/optimistic";
import { CATEGORIES, CATEGORY_TREE, type Category } from "@trip/backend/categories";
import { findNode } from "@trip/backend/tree";
import type { Activity, TripDetails } from "@trip/backend/types";
import { categoryLabel, categoryMeta, cn, fallbackPhoto, subcategoryMeta } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from "react-native";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";

type Props = { tripId: Id<"trips">; activityId: Id<"activities"> };

export function EditActivity({ tripId, activityId }: Props) {
  const trip = useQuery(api.trips.get, { tripId });
  const activity = trip?.subTrips.map((s) => findNode(s.activities, activityId)).find(Boolean);

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
  const create = useMutation(api.activities.create);
  const move = useMutation(api.activities.move).withOptimisticUpdate(optimisticMove);
  const remove = useMutation(api.activities.remove).withOptimisticUpdate(optimisticRemove);

  const [form, setForm] = useState({
    title: activity.title,
    description: activity.description,
    startTime: activity.startTime ?? "",
    address: activity.address,
    phone: activity.phone ?? "",
    bookingUrl: activity.bookingUrl ?? "",
    category: (activity.category ?? "other") as Category,
    subcategory: activity.subcategory ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [newStep, setNewStep] = useState("");
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const day = trip.subTrips.find((s) => s._id === activity.subTripId);
  // Siblings: the parent's steps for a sub-activity, otherwise the day's activities.
  const parent = day && activity.parentId ? findNode(day.activities, activity.parentId) : undefined;
  const siblings = parent?.children ?? day?.activities ?? [];
  const index = siblings.findIndex((a) => a._id === activity._id);
  const count = siblings.length;
  const subOptions = CATEGORY_TREE[form.category] as readonly string[];

  const moveTo = (toSubTripId: Id<"subTrips">, toIndex: number, toParentId = activity.parentId) =>
    void move({ activityId: activity._id, toSubTripId, toIndex, toParentId });

  const addStep = async () => {
    const title = newStep.trim();
    if (!title) return;
    setNewStep("");
    await create({
      subTripId: activity.subTripId,
      parentId: activity._id,
      title,
      description: "",
      address: activity.address,
      latitude: activity.latitude,
      longitude: activity.longitude,
      category: activity.category,
      subcategory: activity.subcategory,
      photoUrl: fallbackPhoto(`${activity.title}-${title}`),
    });
  };

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
          category: form.category,
          subcategory: form.subcategory,
        },
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      "Delete this activity?",
      activity.children.length ? `${activity.title} and everything inside it` : activity.title,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            router.back();
            void remove({ activityId: activity._id });
          },
        },
      ],
    );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-5 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      <Field label="Title" value={form.title} onChangeText={set("title")} />
      <Field label="Description" value={form.description} onChangeText={set("description")} multiline />

      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">Category</Text>
        <Chips
          options={CATEGORIES.map((c) => ({ value: c, label: `${categoryMeta[c].emoji} ${categoryMeta[c].label}` }))}
          selected={form.category}
          onSelect={(c) => setForm((f) => ({ ...f, category: c as Category, subcategory: "" }))}
        />
        {subOptions.length > 0 && (
          <Chips
            options={subOptions.map((s) => ({ value: s, label: `${subcategoryMeta[s]?.emoji ?? ""} ${subcategoryMeta[s]?.label ?? s}` }))}
            selected={form.subcategory}
            onSelect={(s) => setForm((f) => ({ ...f, subcategory: f.subcategory === s ? "" : s }))}
          />
        )}
      </View>
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
        <Text className="text-sm font-semibold text-muted-foreground">Steps inside</Text>
        {activity.children.map((child) => {
          const badge = categoryLabel(child.category, child.subcategory);
          return (
            <Pressable
              key={child._id}
              onPress={() => router.push({ pathname: "/trips/[tripId]/activity/[activityId]", params: { tripId: trip._id, activityId: child._id } })}
              className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 active:opacity-70"
            >
              <Text className="text-base">{badge.emoji}</Text>
              <View className="flex-1">
                <Text className={cn("text-base font-semibold text-foreground", child.isCompleted && "text-muted-foreground line-through")}>{child.title}</Text>
                {child.children.length > 0 && (
                  <Text className="text-xs text-muted-foreground">{child.children.length} more inside</Text>
                )}
              </View>
              <Icon name="chevron" size={14} colorVar="--color-muted-foreground" />
            </Pressable>
          );
        })}
        <View className="flex-row gap-2">
          <TextInput
            value={newStep}
            onChangeText={setNewStep}
            onSubmitEditing={() => void addStep()}
            returnKeyType="done"
            placeholder="Add a step, e.g. Check in"
            placeholderTextColorClassName="accent-muted-foreground"
            className="flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-base text-foreground"
          />
          <Button size="sm" icon="plus" disabled={!newStep.trim()} onPress={() => void addStep()}>
            Add
          </Button>
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">Order</Text>
        <View className="flex-row gap-2">
          <Button variant="secondary" size="sm" icon="up" disabled={index === 0} onPress={() => day && moveTo(day._id, index - 1)}>
            Earlier
          </Button>
          <Button variant="secondary" size="sm" icon="down" disabled={index >= count - 1} onPress={() => day && moveTo(day._id, index + 1)}>
            Later
          </Button>
          {activity.parentId && (
            <Button
              variant="secondary"
              size="sm"
              onPress={() => parent && moveTo(activity.subTripId, parent.order + 1, parent.parentId)}
            >
              Move out a level
            </Button>
          )}
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
                onPress={() => !selected && moveTo(s._id, s.activities.length, undefined)}
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

function Chips({ options, selected, onSelect }: { options: { value: string; label: string }[]; selected: string; onSelect: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {options.map((o) => {
        const on = o.value === selected;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(o.value)}
            className={cn("rounded-full border px-3 py-1.5", on ? "border-primary bg-primary" : "border-border bg-card")}
          >
            <Text className={cn("text-sm font-semibold", on ? "text-primary-foreground" : "text-foreground")}>{o.label}</Text>
          </Pressable>
        );
      })}
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
