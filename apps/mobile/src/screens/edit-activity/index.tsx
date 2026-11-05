import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticMove, optimisticRemove } from "@trip/backend/optimistic";
import { CATEGORIES, CATEGORY_TREE, type Category } from "@trip/backend/categories";
import { findNode } from "@trip/backend/tree";
import type { Activity, TripDetails } from "@trip/backend/types";
import type { Messages } from "@trip/i18n";
import { useI18n } from "@trip/i18n/react";
import { categoryMeta, cn, fallbackPhoto, parseTime, subcategoryMeta } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button } from "@/components/button";
import { Chips, Field } from "@/components/form";
import { Icon } from "@/components/icon";
import { PlaceInfo } from "./place-info";

type Props = { tripId: Id<"trips">; activityId: Id<"activities"> };

export function EditActivity({ tripId, activityId }: Props) {
  const trip = useQuery(api.trips.get, { tripId });
  const activity = trip?.subTrips.map((s) => findNode(s.activities, activityId)).find(Boolean);
  const { t } = useI18n();

  if (trip === undefined) return <ActivityIndicator className="mt-10" />;
  if (!trip || !activity) {
    return <Text className="m-6 text-muted-foreground">{t("mobileEdit.removed")}</Text>;
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
  const { t, f, category: categoryText } = useI18n();

  const [form, setForm] = useState({
    title: activity.title,
    description: activity.description,
    startTime: f.time(activity.startTime),
    address: activity.address,
    phone: activity.phone ?? "",
    bookingUrl: activity.bookingUrl ?? "",
    category: (activity.category ?? "other") as Category,
    subcategory: activity.subcategory ?? "",
    estimatedCost: activity.estimatedCost?.toString() ?? "",
    actualCost: activity.actualCost?.toString() ?? "",
  });
  const num = (text: string) => (text.trim() === "" || Number.isNaN(Number(text)) ? undefined : Math.max(0, Number(text)));
  const [saving, setSaving] = useState(false);
  const [newStep, setNewStep] = useState("");
  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

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
    if (!form.title.trim()) return Alert.alert(t("mobileEdit.addTitle"));
    const startTime = form.startTime.trim() ? parseTime(form.startTime) : undefined;
    if (startTime === null) return Alert.alert(t("mobileEdit.checkTime"), t("mobileEdit.checkTimeBody", { example: f.time("09:30") }));
    setSaving(true);
    try {
      await update({
        activityId: activity._id,
        patch: {
          title: form.title.trim(),
          description: form.description.trim(),
          address: form.address.trim(),
          startTime,
          phone: form.phone.trim() || undefined,
          bookingUrl: form.bookingUrl.trim() || undefined,
          category: form.category,
          subcategory: form.subcategory,
          estimatedCost: num(form.estimatedCost),
          actualCost: num(form.actualCost),
        },
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      t("mobileEdit.deleteTitle"),
      activity.children.length ? t("mobileEdit.andInside", { title: activity.title }) : activity.title,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
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
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-5 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      <PlaceInfo activityId={activity._id} />
      <Field label={t("editor.title")} value={form.title} onChangeText={set("title")} />
      <Field label={t("editor.description")} value={form.description} onChangeText={set("description")} multiline />

      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("editor.category")}</Text>
        <Chips
          options={CATEGORIES.map((c) => ({ value: c, label: `${categoryMeta[c].emoji} ${t(`categories.${c}`)}` }))}
          selected={form.category}
          onSelect={(c) => setForm((prev) => ({ ...prev, category: c as Category, subcategory: "" }))}
        />
        {subOptions.length > 0 && (
          <Chips
            options={subOptions.map((s) => ({ value: s, label: `${subcategoryMeta[s]?.emoji ?? ""} ${t(`subcategories.${s as keyof Messages["subcategories"]}`)}` }))}
            selected={form.subcategory}
            onSelect={(s) => setForm((prev) => ({ ...prev, subcategory: prev.subcategory === s ? "" : s }))}
          />
        )}
      </View>
      <View className="flex-row gap-3">
        <Field label={t("editor.startTime")} value={form.startTime} onChangeText={set("startTime")} placeholder={f.time("09:30")} autoCapitalize="characters" className="w-32" />
        <Field label={t("editor.phone")} value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" className="flex-1" />
      </View>
      <View className="flex-row gap-3">
        <Field label={t("editor.estimatedCost")} value={form.estimatedCost} onChangeText={set("estimatedCost")} keyboardType="decimal-pad" placeholder={t("editor.perPerson")} className="flex-1" />
        <Field label={t("editor.actuallySpent")} value={form.actualCost} onChangeText={set("actualCost")} keyboardType="decimal-pad" placeholder={t("editor.perPerson")} className="flex-1" />
      </View>
      <Field label={t("editor.address")} value={form.address} onChangeText={set("address")} />
      <Field
        label={t("editor.reservationLink")}
        value={form.bookingUrl}
        onChangeText={set("bookingUrl")}
        placeholder="https://"
        autoCapitalize="none"
        keyboardType="url"
      />

      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("mobileEdit.stepsInside")}</Text>
        {activity.children.map((child) => {
          const badge = categoryText(child.category, child.subcategory);
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
                  <Text className="text-xs text-muted-foreground">{t("mobileEdit.moreInside", { count: child.children.length })}</Text>
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
            placeholder={t("mobileEdit.addStepPlaceholder")}
            placeholderTextColorClassName="accent-muted-foreground"
            className="flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-base text-foreground"
          />
          <Button size="sm" icon="plus" disabled={!newStep.trim()} onPress={() => void addStep()}>
            {t("common.add")}
          </Button>
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("mobileEdit.order")}</Text>
        <View className="flex-row gap-2">
          <Button variant="secondary" size="sm" icon="up" disabled={index === 0} onPress={() => day && moveTo(day._id, index - 1)}>
            {t("mobileEdit.earlier")}
          </Button>
          <Button variant="secondary" size="sm" icon="down" disabled={index >= count - 1} onPress={() => day && moveTo(day._id, index + 1)}>
            {t("mobileEdit.later")}
          </Button>
          {activity.parentId && (
            <Button
              variant="secondary"
              size="sm"
              onPress={() => parent && moveTo(activity.subTripId, parent.order + 1, parent.parentId)}
            >
              {t("mobileEdit.moveOut")}
            </Button>
          )}
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("mobileMoney.day")}</Text>
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
                  {t("time.dayN", { day: s.dayNumber })}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Button onPress={save} loading={saving} className="mt-2">
        {t("mobileEdit.saveChanges")}
      </Button>
      <Button variant="danger" icon="trash" onPress={confirmDelete}>
        {t("mobileEdit.deleteActivity")}
      </Button>
    </ScrollView>
  );
}
