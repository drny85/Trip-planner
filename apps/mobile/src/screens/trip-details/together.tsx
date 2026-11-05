import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { categoryLabel, cn, formatTime } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Alert, Pressable, Share, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Button } from "@/components/button";
import { webUrl } from "@/lib/open";
import { CSS_EASE_OUT, EASE_IN_OUT, EASE_OUT, enterUp } from "@/lib/motion";

const AVATAR_COLORS = ["#0e7c66", "#6366f1", "#f97316", "#ec4899", "#0ea5e9", "#8b5cf6", "#16a34a", "#e11d48"];
const colorFor = (id: string) => AVATAR_COLORS[[...id].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_COLORS.length]!;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

function Avatar({ name, userId, size = 34 }: { name: string; userId: string; size?: number }) {
  return (
    <View
      className="items-center justify-center rounded-full border-2 border-card"
      style={{ width: size, height: size, backgroundColor: colorFor(userId) }}
    >
      <Text className="font-bold text-white" style={{ fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/** Who's going, plus the invite link (organizer) or a Leave button (member). */
export function Crew({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.members.forTrip, { tripId });
  const createInvite = useMutation(api.members.createInvite);
  const revokeInvite = useMutation(api.members.revokeInvite);
  const removeMember = useMutation(api.members.remove);
  if (!data) return null;
  const count = data.members.length;

  const invite = async () => {
    const token = await createInvite({ tripId });
    const url = `${webUrl}/join/${token}`;
    await Share.share({ message: `Join my trip on Trip Planner: ${url}`, url });
  };

  const manage = (m: (typeof data.members)[number]) => {
    if (!data.isOwner || m.role === "owner") return;
    Alert.alert(m.name, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove from trip", style: "destructive", onPress: () => void removeMember({ tripId, userId: m.userId }) },
    ]);
  };

  return (
    <Animated.View entering={enterUp(2)} className="mx-4 mt-4 gap-4 rounded-3xl bg-card p-5 shadow-sm shadow-black/5">
      <View className="flex-row items-center gap-4">
        <View className="flex-row">
          {data.members.slice(0, 5).map((m, i) => (
            <Pressable key={m.userId} onPress={() => manage(m)} style={{ marginLeft: i === 0 ? 0 : -10 }} accessibilityLabel={m.name}>
              <Avatar name={m.name} userId={m.userId} />
            </Pressable>
          ))}
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-foreground">{count === 1 ? "Just you so far" : `${count} going`}</Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={2}>
            {data.members.map((m) => (m.isMe ? "You" : m.name.split(" ")[0])).join(", ")}
          </Text>
        </View>
      </View>
      {data.isOwner && (
        <View className="flex-row gap-2">
          <Button size="sm" icon="plus" onPress={() => void invite()}>
            Invite friends
          </Button>
          {data.inviteToken && (
            <Button size="sm" variant="ghost" onPress={() => void revokeInvite({ tripId })}>
              Turn off link
            </Button>
          )}
        </View>
      )}
    </Animated.View>
  );
}

type Ideas = NonNullable<FunctionReturnType<typeof api.suggestions.forTrip>>;
type Day = { _id: Id<"subTrips">; dayNumber: number };

/** Group ideas with yes/no voting. An idea joins the plan when more than half vote yes. */
export function IdeasSection({ tripId, subTrips }: { tripId: Id<"trips">; subTrips: Day[] }) {
  const data = useQuery(api.suggestions.forTrip, { tripId });
  const router = useRouter();
  if (!data) return null;
  const dayName = (id: string) => `Day ${subTrips.find((d) => d._id === id)?.dayNumber ?? "?"}`;

  return (
    <View className="mt-10 gap-3 px-4">
      <View className="flex-row items-end justify-between">
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">Decide together</Text>
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">Ideas & votes</Text>
          <Text className="text-xs text-muted-foreground">
            {data.memberCount === 1
              ? "Ideas you suggest join the plan right away. Invite friends to vote together."
              : `An idea joins the plan once more than half of the ${data.memberCount} travelers vote yes.`}
          </Text>
        </View>
        <Button size="sm" icon="sparkles" onPress={() => router.push({ pathname: "/trips/[tripId]/suggest", params: { tripId } })}>
          Suggest
        </Button>
      </View>

      {data.open.length === 0 && (
        <View className="rounded-3xl border border-dashed border-border p-6">
          <Text className="text-center text-sm text-muted-foreground">No open ideas. Suggest a place and let the group vote.</Text>
        </View>
      )}
      {data.open.map((idea) => (
        <Animated.View
          key={idea._id}
          entering={FadeIn.duration(220).easing(EASE_OUT)}
          exiting={FadeOut.duration(160)}
          layout={LinearTransition.duration(240).easing(EASE_IN_OUT)}
        >
          <IdeaCard idea={idea} dayName={dayName(idea.subTripId)} />
        </Animated.View>
      ))}

      {data.decided.length > 0 && (
        <View className="mt-2 gap-2">
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Recently decided</Text>
          {data.decided.map((s) => (
            <Animated.View key={s._id} entering={FadeIn.duration(220)} className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3">
              <View className={cn("h-6 w-6 items-center justify-center rounded-full", s.status === "accepted" ? "bg-success" : "bg-muted-foreground")}>
                <Text className="text-xs font-bold text-white">{s.status === "accepted" ? "✓" : "✕"}</Text>
              </View>
              <Text className="flex-1 font-semibold text-foreground" numberOfLines={1}>
                {s.title}
              </Text>
              <Text className="text-xs text-muted-foreground">{s.status === "accepted" ? `Added · ${dayName(s.subTripId)}` : "Not added"}</Text>
            </Animated.View>
          ))}
        </View>
      )}
    </View>
  );
}

function IdeaCard({ idea, dayName }: { idea: Ideas["open"][number]; dayName: string }) {
  const vote = useMutation(api.suggestions.vote);
  const withdraw = useMutation(api.suggestions.withdraw);
  const badge = categoryLabel(idea.category, idea.subcategory);
  const { yes, no, members } = idea.tally;

  const cast = async (value: "yes" | "no") => {
    void Haptics.selectionAsync();
    const outcome = await vote({ suggestionId: idea._id, value });
    if (outcome === "accepted") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View className="gap-3 rounded-3xl bg-card p-4 shadow-sm shadow-black/5">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-xs font-semibold text-muted-foreground" numberOfLines={1}>
          {idea.isMine ? "You" : idea.authorName} · {dayName}
          {idea.startTime ? ` at ${formatTime(idea.startTime)}` : ""}
        </Text>
        <Text className="text-xs font-semibold" style={{ color: badge.color }}>
          {badge.emoji} {badge.text}
        </Text>
      </View>
      <Text className="text-lg font-bold leading-6 text-foreground">{idea.title}</Text>
      {idea.description ? (
        <Text className="text-sm text-muted-foreground" numberOfLines={2}>
          {idea.description}
        </Text>
      ) : null}

      <View className="flex-row gap-1">
        {Array.from({ length: members }, (_, i) => (
          <Animated.View
            key={i}
            className={cn("h-1.5 flex-1 rounded-full", i < yes ? "bg-success" : i >= members - no ? "bg-danger" : "bg-muted")}
            style={{ transitionProperty: "backgroundColor", transitionDuration: 250, transitionTimingFunction: CSS_EASE_OUT }}
          />
        ))}
      </View>
      <Text className="text-xs text-muted-foreground">
        {yes} yes · {no} no · {idea.yesNeeded === 1 ? "1 more yes adds it" : `${idea.yesNeeded} more yes votes add it`}
      </Text>

      <View className="flex-row items-center gap-2">
        {(["yes", "no"] as const).map((value) => {
          const on = idea.myVote === value;
          return (
            <Button
              key={value}
              size="sm"
              variant={on ? "primary" : "secondary"}
              onPress={() => void cast(value)}
              containerClassName="flex-1"
              className={cn(on && value === "no" && "bg-danger")}
              accessibilityState={{ selected: on }}
            >
              {value === "yes" ? "👍 Yes" : "👎 No"}
            </Button>
          );
        })}
        {idea.isMine && (
          <Button size="sm" variant="ghost" onPress={() => void withdraw({ suggestionId: idea._id })}>
            Withdraw
          </Button>
        )}
      </View>
    </View>
  );
}
