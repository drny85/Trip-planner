import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Share, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/button";
import { EASE_OUT } from "@/lib/motion";
import { openDayRoute, webUrl } from "@/lib/open";

const cleanError = (e: unknown) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : undefined);

/** The trip's story: write it with AI, read it, open each day's route, and publish and share it. */
export function TripStory({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.journal.story, { tripId });
  const write = useMutation(api.journal.writeStory);
  const publish = useMutation(api.journal.publishStory);
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const { t, f, locale } = useI18n();
  if (data === undefined) return <ActivityIndicator className="mt-10" />;
  if (data === null) return <Text className="p-8 text-center text-muted-foreground">{t("trip.notFound")}</Text>;

  const writing = data.status === "writing";
  const story = data.story;
  const ask = () => void write({ tripId, language: locale }).catch((e: unknown) => Alert.alert(t("journal.couldntStart"), cleanError(e)));

  const share = async () => {
    setBusy(true);
    try {
      const token = (await publish({ tripId, published: true }))!;
      const url = `${webUrl}/share/${token}/story`;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Share.share({ title: story?.title, message: t("mobileTrip.shareMessage", { title: story?.title ?? t("journal.defaultTitle"), url }), url });
    } catch (e) {
      Alert.alert(t("journal.couldntPublish"), cleanError(e));
    } finally {
      setBusy(false);
    }
  };
  const unpublish = () =>
    Alert.alert(t("journal.unpublishTitle"), t("journal.unpublishBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("journal.unpublish"), style: "destructive", onPress: () => void publish({ tripId, published: false }) },
    ]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-6 p-5 pb-16">
      <Stack.Screen options={{ title: t("journal.ourStory") }} />
      {data.error && <Text className="text-sm text-danger">{data.error}</Text>}

      {!story ? (
        <View className="gap-4 pt-4">
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">{t("journal.turnInto")}</Text>
          <Text className="text-base text-muted-foreground">
            {t("journal.aiWrites")} {data.tripEnded ? "" : t("journal.writeAgainAfter")}
          </Text>
          <Button icon="sparkles" loading={writing} disabled={data.completedCount === 0} onPress={ask}>
            {writing ? t("journal.writing") : t("journal.write")}
          </Button>
          {data.completedCount === 0 && <Text className="text-center text-sm text-muted-foreground">{t("journal.checkOffFirst")}</Text>}
        </View>
      ) : (
        <>
          <Animated.View entering={FadeInDown.duration(400).easing(EASE_OUT)} className="gap-3">
            <Text className="text-3xl font-extrabold leading-9 tracking-tight text-foreground">{story.title}</Text>
            {story.intro ? <Text className="text-lg leading-7 text-muted-foreground">{story.intro}</Text> : null}
          </Animated.View>

          <View className="gap-2">
            {data.canPublish &&
              (data.isPublished ? (
                <View className="flex-row gap-2">
                  <Button icon="share" containerClassName="flex-1" loading={busy} onPress={() => void share()}>
                    {t("journal.shareLink")}
                  </Button>
                  <Button variant="secondary" onPress={unpublish}>
                    {t("journal.unpublish")}
                  </Button>
                </View>
              ) : (
                <Button icon="share" loading={busy} onPress={() => void share()}>
                  {t("journal.publishShare")}
                </Button>
              ))}
            <Button variant="secondary" icon="sparkles" loading={writing} onPress={ask}>
              {writing ? t("journal.rewriting") : t("journal.writeAgain")}
            </Button>
            {data.canPublish && !data.isPublished && (
              <Text className="text-center text-xs text-muted-foreground">{t("journal.publishHintShort")}</Text>
            )}
          </View>

          {story.chapters.map((c, i) => (
            <Animated.View key={c.subTripId} entering={FadeInDown.duration(400).delay(80 + Math.min(i, 5) * 60).easing(EASE_OUT)} className="gap-3">
              <Text className="text-xs font-bold uppercase tracking-widest text-primary">
                {t("time.dayN", { day: c.dayNumber })}
                {c.date ? ` · ${f.weekday(c.date)}` : ""}
                {c.location ? ` · ${c.location}` : ""}
              </Text>
              <Text className="text-2xl font-bold tracking-tight text-foreground">{c.heading}</Text>
              {c.body.split(/\n{2,}/).map((p, j) => (
                <Text key={j} className="text-base leading-6 text-foreground">
                  {p}
                </Text>
              ))}
              {c.photos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-5" className="-mx-5">
                  {c.photos.map((p) => (
                    <View key={p._id} className="overflow-hidden rounded-2xl">
                      <Image source={p.url} style={{ width: Math.min(width * 0.7, 320), height: Math.min(width * 0.7, 320) * 0.75 }} contentFit="cover" transition={150} />
                      {(p.caption || p.activityTitle) && (
                        <Text className="absolute bottom-2 left-3 right-3 text-xs font-semibold text-white" numberOfLines={1}>
                          {p.caption ?? p.activityTitle}
                        </Text>
                      )}
                    </View>
                  ))}
                </ScrollView>
              )}
              {c.route.length > 1 && (
                <Button size="sm" variant="secondary" icon="route" className="self-start" onPress={() => void openDayRoute(c.route)}>
                  {t("journal.dayRoute", { day: c.dayNumber })}
                </Button>
              )}
            </Animated.View>
          ))}
          {story.closing ? <Text className="border-t border-border pt-6 text-center text-lg italic text-muted-foreground">{story.closing}</Text> : null}
        </>
      )}
    </ScrollView>
  );
}
