import { api } from "@trip/backend/api";
import { CATEGORIES, CATEGORY_TREE, type Category } from "@trip/backend/categories";
import type { Id } from "@trip/backend/dataModel";
import { categoryMeta, fallbackPhoto, subcategoryMeta } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { Button } from "@/components/button";
import { Chips, Field } from "@/components/form";

/** Sheet for proposing an activity; it goes to a group vote. */
export function SuggestIdea({ tripId }: { tripId: Id<"trips"> }) {
  const trip = useQuery(api.trips.get, { tripId });
  const create = useMutation(api.suggestions.create);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    address: "",
    subTripId: "",
    category: "food" as Category,
    subcategory: "",
    startTime: "",
    estimatedCost: "",
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  if (!trip) return <ActivityIndicator className="mt-10" />;
  const dayId = form.subTripId || trip.subTrips[0]?._id || "";
  const subs = CATEGORY_TREE[form.category] as readonly string[];

  const submit = async () => {
    if (!form.title.trim()) return Alert.alert("What's the idea?");
    setSaving(true);
    try {
      const cost = Number(form.estimatedCost);
      const outcome = await create({
        subTripId: dayId as Id<"subTrips">,
        title: form.title.trim(),
        description: form.description.trim(),
        address: form.address.trim(),
        category: form.category,
        subcategory: form.subcategory || undefined,
        startTime: form.startTime.trim() || undefined,
        estimatedCost: form.estimatedCost && !Number.isNaN(cost) ? cost : undefined,
        photoUrl: fallbackPhoto(form.title),
      });
      void outcome;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12" keyboardShouldPersistTaps="handled">
      <Text className="text-sm text-muted-foreground">Everyone on the trip can vote. It&apos;s added once more than half say yes.</Text>
      <Field label="What's the idea?" value={form.title} onChangeText={set("title")} placeholder="Sunset cruise on the Sumida" autoFocus />
      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">Day</Text>
        <Chips options={trip.subTrips.map((d) => ({ value: d._id, label: `Day ${d.dayNumber}` }))} selected={dayId} onSelect={set("subTripId")} />
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">Category</Text>
        <Chips
          options={CATEGORIES.map((c) => ({ value: c, label: `${categoryMeta[c].emoji} ${categoryMeta[c].label}` }))}
          selected={form.category}
          onSelect={(c) => setForm((f) => ({ ...f, category: c as Category, subcategory: "" }))}
        />
        {subs.length > 0 && (
          <Chips
            options={subs.map((s) => ({ value: s, label: `${subcategoryMeta[s]?.emoji ?? ""} ${subcategoryMeta[s]?.label ?? s}` }))}
            selected={form.subcategory}
            onSelect={(s) => setForm((f) => ({ ...f, subcategory: f.subcategory === s ? "" : s }))}
          />
        )}
      </View>
      <View className="flex-row gap-3">
        <Field label="Time" value={form.startTime} onChangeText={set("startTime")} placeholder="19:30" className="w-28" />
        <Field label="Cost per person" value={form.estimatedCost} onChangeText={set("estimatedCost")} keyboardType="decimal-pad" className="flex-1" />
      </View>
      <Field label="Why it's worth it" value={form.description} onChangeText={set("description")} multiline />
      <Field label="Address" value={form.address} onChangeText={set("address")} />
      <Button onPress={() => void submit()} loading={saving} icon="sparkles" className="mt-2">
        Post for a vote
      </Button>
    </ScrollView>
  );
}
