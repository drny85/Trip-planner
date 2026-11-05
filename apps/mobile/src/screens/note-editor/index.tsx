import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput } from "react-native";
import { Button } from "@/components/button";

const MAX_NOTE = 500;

/** Sheet: write, edit or delete your journal note on a done activity. */
export function NoteEditor({ tripId, activityId }: { tripId: Id<"trips">; activityId: Id<"activities"> }) {
  const notes = useQuery(api.journal.notesForTrip, { tripId });
  const trip = useQuery(api.trips.get, { tripId });
  const save = useMutation(api.journal.saveNote);
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();
  if (notes === undefined || trip === undefined) return <ActivityIndicator className="mt-10" />;

  const mine = notes?.find((n) => n.activityId === activityId && n.isMine);
  const title = trip?.subTrips.flatMap((d) => flat(d.activities)).find((a) => a._id === activityId)?.title;
  const value = text ?? mine?.text ?? "";

  const submit = async (next: string) => {
    setBusy(true);
    try {
      await save({ activityId, text: next });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert(t("journal.couldntSave"), e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12" keyboardShouldPersistTaps="handled">
      {title && <Text className="text-lg font-bold text-foreground">{title}</Text>}
      <TextInput
        autoFocus
        value={value}
        onChangeText={setText}
        maxLength={MAX_NOTE}
        multiline
        placeholder={t("journal.placeholder")}
        className="min-h-32 rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground"
        textAlignVertical="top"
      />
      <Text className={cn("text-right text-xs text-muted-foreground", value.length > MAX_NOTE - 40 && "text-danger")}>
        {value.length}/{MAX_NOTE}
      </Text>
      <Text className="text-sm text-muted-foreground">{t("journal.visibleHint")}</Text>
      <Button icon="check" loading={busy} disabled={!value.trim() || value.trim() === mine?.text} onPress={() => void submit(value)}>
        {t("journal.saveNote")}
      </Button>
      {mine && (
        <Button variant="danger" icon="trash" disabled={busy} onPress={() => void submit("")}>
          {t("journal.deleteNote")}
        </Button>
      )}
    </ScrollView>
  );
}

type Node = { _id: string; title: string; children: Node[] };
const flat = (nodes: Node[]): Node[] => nodes.flatMap((n) => [n, ...flat(n.children)]);
