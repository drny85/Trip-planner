import { api } from "@trip/backend/api";
import { CATEGORIES, CATEGORY_TREE, type Category } from "@trip/backend/categories";
import type { Id } from "@trip/backend/dataModel";
import type { Messages } from "@trip/i18n";
import { useI18n } from "@trip/i18n/react";
import { categoryMeta, fallbackPhoto, parseTime, subcategoryMeta } from "@trip/ui";
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
  const { t, f } = useI18n();
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
  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  if (!trip) return <ActivityIndicator className="mt-10" />;
  const dayId = form.subTripId || trip.subTrips[0]?._id || "";
  const subs = CATEGORY_TREE[form.category] as readonly string[];

  const submit = async () => {
    if (!form.title.trim()) return Alert.alert(t("ideas.whatsTheIdea"));
    const startTime = form.startTime.trim() ? parseTime(form.startTime) : undefined;
    if (startTime === null) return Alert.alert(t("mobileSheets.checkTime"), t("mobileSheets.checkTimeExample", { example: f.time("19:30") }));
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
        startTime,
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
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12" keyboardShouldPersistTaps="handled">
      <Text className="text-sm text-muted-foreground">{t("mobileSheets.voteHint")}</Text>
      <Field label={t("ideas.whatsTheIdea")} value={form.title} onChangeText={set("title")} placeholder={t("ideas.ideaPlaceholder")} autoFocus />
      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("ideas.day")}</Text>
        <Chips options={trip.subTrips.map((d) => ({ value: d._id, label: t("time.dayN", { day: d.dayNumber }) }))} selected={dayId} onSelect={set("subTripId")} />
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("editor.category")}</Text>
        <Chips
          options={CATEGORIES.map((c) => ({ value: c, label: `${categoryMeta[c].emoji} ${t(`categories.${c}`)}` }))}
          selected={form.category}
          onSelect={(c) => setForm((prev) => ({ ...prev, category: c as Category, subcategory: "" }))}
        />
        {subs.length > 0 && (
          <Chips
            options={subs.map((s) => ({ value: s, label: `${subcategoryMeta[s]?.emoji ?? ""} ${t(`subcategories.${s as keyof Messages["subcategories"]}`)}` }))}
            selected={form.subcategory}
            onSelect={(s) => setForm((prev) => ({ ...prev, subcategory: prev.subcategory === s ? "" : s }))}
          />
        )}
      </View>
      <View className="flex-row gap-3">
        <Field label={t("ideas.time")} value={form.startTime} onChangeText={set("startTime")} placeholder={f.time("19:30")} autoCapitalize="characters" className="w-32" />
        <Field label={t("ideas.costPerPerson")} value={form.estimatedCost} onChangeText={set("estimatedCost")} keyboardType="decimal-pad" className="flex-1" />
      </View>
      <Field label={t("ideas.whyWorth")} value={form.description} onChangeText={set("description")} multiline />
      <Field label={t("editor.address")} value={form.address} onChangeText={set("address")} />
      <Button onPress={() => void submit()} loading={saving} icon="sparkles" className="mt-2">
        {t("ideas.post")}
      </Button>
    </ScrollView>
  );
}
