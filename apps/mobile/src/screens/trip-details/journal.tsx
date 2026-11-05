import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Button } from "@/components/button";
import { PressableScale } from "@/components/pressable-scale";

/**
 * The trip journal on mobile: each traveler's note on things they've done, loaded
 * once for the trip and shared through context, plus the "Our story" card.
 */
type Note = NonNullable<FunctionReturnType<typeof api.journal.notesForTrip>>[number];
const JournalContext = createContext<Map<string, Note[]>>(new Map());

export function JournalProvider({ tripId, children }: { tripId: Id<"trips">; children: ReactNode }) {
  const notes = useQuery(api.journal.notesForTrip, { tripId });
  const byActivity = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes ?? []) map.set(n.activityId, [...(map.get(n.activityId) ?? []), n]);
    return map;
  }, [notes]);
  return <JournalContext.Provider value={byActivity}>{children}</JournalContext.Provider>;
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

/** Notes on an activity card, and "Add a note" once it's done. Tapping your own note edits it. */
export function ActivityNotes({ tripId, activityId, isCompleted }: { tripId: Id<"trips">; activityId: Id<"activities">; isCompleted: boolean }) {
  const notes = useContext(JournalContext).get(activityId) ?? [];
  const router = useRouter();
  const { t } = useI18n();
  if (!isCompleted && notes.length === 0) return null;
  const edit = () => router.push({ pathname: "/trips/[tripId]/note/[activityId]", params: { tripId, activityId } });
  const mine = notes.some((n) => n.isMine);

  return (
    <View className="gap-2 pt-3">
      {notes.map((n) => (
        <Animated.View key={n._id} entering={FadeIn.duration(200)}>
          <Pressable disabled={!n.isMine} onPress={edit} accessibilityHint={n.isMine ? t("journal.editYourNote") : undefined} className="flex-row gap-2.5 rounded-2xl bg-muted p-3 active:opacity-70">
            <View className="h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-primary/15">
              {n.authorImageUrl ? (
                <Image source={n.authorImageUrl} style={{ width: "100%", height: "100%" }} />
              ) : (
                <Text className="text-xs font-bold text-primary">{initial(n.authorName)}</Text>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-muted-foreground">{n.isMine ? t("split.you") : n.authorName}</Text>
              <Text className="text-sm text-foreground">{n.text}</Text>
            </View>
          </Pressable>
        </Animated.View>
      ))}
      {isCompleted && !mine && (
        <Pressable onPress={edit} accessibilityRole="button" className="self-start rounded-full border border-dashed border-border px-3 py-1.5 active:opacity-70">
          <Text className="text-sm font-semibold text-muted-foreground">✍️ {t("journal.addNote")}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** The "Our story" card near the end of the trip page. Opens the story screen. */
export function StoryCard({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.journal.story, { tripId });
  const router = useRouter();
  const { t } = useI18n();
  if (!data) return null;
  const open = () => router.push({ pathname: "/trips/[tripId]/story", params: { tripId } });
  const cover = data.story?.chapters.flatMap((c) => c.photos)[0]?.url;

  return (
    <View className="mt-10 gap-3 px-4">
      <View>
        <Text className="text-xs font-bold uppercase tracking-widest text-primary">{t("journal.eyebrow")}</Text>
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">{t("journal.ourStory")}</Text>
      </View>
      {data.story ? (
        <PressableScale onPress={open} accessibilityRole="button" className="overflow-hidden rounded-3xl border border-border bg-card">
          {cover && <Image source={cover} style={{ width: "100%", height: 160 }} contentFit="cover" transition={150} />}
          <View className="gap-1 p-4">
            <Text className="text-lg font-bold text-foreground">{data.story.title}</Text>
            <Text className="text-sm text-muted-foreground" numberOfLines={2}>
              {data.story.intro}
            </Text>
            <Text className="pt-1 text-sm font-semibold text-primary">
              {data.status === "writing" ? t("journal.rewriting") : data.isPublished ? t("journal.publishedRead") : t("journal.readStoryArrow")}
            </Text>
          </View>
        </PressableScale>
      ) : (
        <View className="gap-3 rounded-3xl border border-border bg-card p-5">
          <Text className="text-sm text-muted-foreground">
            {data.completedCount === 0
              ? t("journal.emptyHint")
              : t("journal.progress", { stops: t("journal.stops", { count: data.completedCount }), notes: t("journal.notes", { count: data.noteCount }) })}
          </Text>
          <Button icon="sparkles" onPress={open} disabled={data.completedCount === 0} loading={data.status === "writing"}>
            {data.status === "writing" ? t("journal.writing") : t("journal.write")}
          </Button>
        </View>
      )}
    </View>
  );
}
