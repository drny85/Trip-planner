import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { Button } from "@/components/button";
import { CSS_EASE_OUT, EASE_IN_OUT, enterUp } from "@/lib/motion";

/**
 * Group voting on the itinerary: 👍 / 👎 and a top-3 ⭐ on every stop, and a
 * "Group picks" card with the most wanted stops and (for the organizer) the
 * button that has the AI rebuild the plan around them. Rules: lib/groupVotes.ts.
 */

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : fallback);

/** 👍 👎 ⭐ under one stop. Hidden on solo trips and for stops that aren't voted on (transport). */
export function VoteBar({ tripId, activityId, title }: { tripId: Id<"trips">; activityId: Id<"activities">; title: string }) {
  const data = useQuery(api.groupVotes.forTrip, { tripId });
  const vote = useMutation(api.groupVotes.vote);
  const setPick = useMutation(api.groupVotes.setPick);
  const { t } = useI18n();
  const mine = data?.byActivity[activityId];
  if (!data || data.memberCount < 2 || !mine) return null;

  const run = (p: Promise<unknown>) => {
    void Haptics.selectionAsync();
    p.catch((e: unknown) => Alert.alert(errorText(e, t("common.somethingWrong"))));
  };

  return (
    <View className="gap-1.5 pt-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <Chip on={mine.myVote === "up"} tone="up" label={t("groupVote.likeAria", { title })} onPress={() => run(vote({ activityId, value: mine.myVote === "up" ? null : "up" }))}>
          {`👍 ${mine.up}`}
        </Chip>
        <Chip on={mine.myVote === "down"} tone="down" label={t("groupVote.dislikeAria", { title })} onPress={() => run(vote({ activityId, value: mine.myVote === "down" ? null : "down" }))}>
          {`👎 ${mine.down}`}
        </Chip>
        <Chip
          on={Boolean(mine.myPick)}
          tone="pick"
          label={mine.myPick ? t("groupVote.unstarAria", { title }) : t("groupVote.starAria", { title })}
          onPress={() => run(setPick({ activityId, picked: !mine.myPick }))}
        >
          {`⭐ ${mine.myPick ? t("groupVote.rank", { rank: mine.myPick }) : t("groupVote.star")}`}
        </Chip>
        {mine.isFirstPick && <Text className="text-xs font-semibold text-amber-500">{`🏆 ${t("groupVote.firstPick")}`}</Text>}
        {mine.votedOut && <Text className="text-xs font-semibold text-danger">{t("groupVote.votedOut")}</Text>}
      </View>
      {mine.voters.length > 0 && (
        <Text className="text-xs text-muted-foreground" numberOfLines={2}>
          {mine.voters.map((v) => `${v.name} ${v.pick ? `⭐${v.pick}` : v.value === "up" ? "👍" : "👎"}`).join(" · ")}
        </Text>
      )}
    </View>
  );
}

function Chip({ on, tone, label, onPress, children }: { on: boolean; tone: "up" | "down" | "pick"; label: string; onPress: () => void; children: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} hitSlop={6}>
      <Animated.View
        className={cn(
          "rounded-full border px-3 py-1.5",
          !on && "border-border bg-card",
          on && tone === "up" && "border-success bg-success",
          on && tone === "down" && "border-danger bg-danger",
          on && tone === "pick" && "border-amber-500 bg-amber-500",
        )}
        style={{ transitionProperty: ["backgroundColor", "borderColor"], transitionDuration: 180, transitionTimingFunction: CSS_EASE_OUT }}
      >
        <Text className={cn("text-sm font-semibold", on ? "text-white" : "text-foreground")}>{children}</Text>
      </Animated.View>
    </Pressable>
  );
}

const TIE = {
  fairness: "groupVote.tieFairness",
  fewerDowns: "groupVote.tieFewerDowns",
  moreSupporters: "groupVote.tieMoreSupporters",
  order: "groupVote.tieOrder",
} as const;

type Day = { activities: { _id: string; title: string }[] };

/** "Group picks": how voting works, the most wanted stops, and "Build plan from votes". */
export function GroupVotesSection({ tripId, subTrips }: { tripId: Id<"trips">; subTrips: Day[] }) {
  const data = useQuery(api.groupVotes.forTrip, { tripId });
  const router = useRouter();
  const { t } = useI18n();
  if (!data || data.memberCount < 2) return null;
  const titles = new Map(subTrips.flatMap((d) => d.activities.map((a) => [a._id, a.title] as const)));

  return (
    <Animated.View entering={enterUp(3)} className="mx-4 mt-4 gap-3 rounded-3xl border border-amber-500/30 bg-card p-5 shadow-sm shadow-black/5">
      <View>
        <Text className="text-xs font-bold uppercase tracking-widest text-amber-500">{t("groupVote.eyebrow")}</Text>
        <Text className="text-xl font-extrabold tracking-tight text-foreground">{`🗳️ ${t("groupVote.title")}`}</Text>
        <Text className="mt-1 text-sm text-muted-foreground">{t("groupVote.intro")}</Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-xs font-semibold text-foreground">{t("groupVote.votedCount", { count: data.voterCount, total: data.memberCount })}</Text>
        <Text className="text-xs text-muted-foreground">{t("groupVote.picksLeft", { count: data.picksLeft })}</Text>
      </View>

      {data.ranking.length === 0 ? (
        <View className="rounded-2xl border border-dashed border-border p-4">
          <Text className="text-center text-sm text-muted-foreground">{t("groupVote.empty")}</Text>
        </View>
      ) : (
        <View className="gap-2">
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("groupVote.mostWanted")}</Text>
          {data.ranking.slice(0, 5).map((r) => (
            <Animated.View
              key={r.activityId}
              entering={FadeIn.duration(200)}
              layout={LinearTransition.duration(240).easing(EASE_IN_OUT)}
              className="flex-row items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5"
            >
              <View className={cn("h-7 w-7 items-center justify-center rounded-full", r.rank === 1 ? "bg-amber-500" : "bg-card")}>
                <Text className={cn("text-xs font-bold", r.rank === 1 ? "text-white" : "text-foreground")}>{r.rank}</Text>
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-foreground" numberOfLines={1}>
                  {`${titles.get(r.activityId) ?? "…"}${r.isFirstPick ? " 🏆" : ""}`}
                </Text>
                {r.tieBrokenBy && <Text className="text-xs text-muted-foreground">{`⚖️ ${t(TIE[r.tieBrokenBy])}`}</Text>}
              </View>
              <Text className="text-xs font-semibold text-muted-foreground">{t("groupVote.points", { count: r.score })}</Text>
            </Animated.View>
          ))}
          {data.votedOutCount > 0 && <Text className="text-xs text-muted-foreground">{t("groupVote.votedOutCount", { count: data.votedOutCount })}</Text>}
        </View>
      )}

      <Text className="text-xs text-muted-foreground">{`⚖️ ${t("groupVote.rules")}`}</Text>
      {data.isOwner ? (
        <Button icon="sparkles" disabled={data.voterCount === 0} onPress={() => router.push({ pathname: "/trips/[tripId]/group-plan", params: { tripId } })}>
          {t("groupVote.build")}
        </Button>
      ) : (
        <Text className="text-sm text-muted-foreground">{t("groupVote.ownerOnly")}</Text>
      )}
    </Animated.View>
  );
}
