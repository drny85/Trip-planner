import { api } from "@trip/backend/api";
import { chatRows, dayLabel, localTime, MAX_MESSAGE_LENGTH, PAGE_SIZE, type ChatRow } from "@trip/backend/chat";
import type { Id } from "@trip/backend/dataModel";
import { optimisticSendChat } from "@trip/backend/optimistic";
import { useI18n } from "@trip/i18n/react";
import { cn, dayTitle } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { requestTripFocus, setVisibleChat, type FocusTarget } from "@/lib/chat-focus";
import { EASE_OUT } from "@/lib/motion";

type ChatData = NonNullable<FunctionReturnType<typeof api.chat.list>>;
type Message = ChatData["messages"][number];
type Draft = { activityId: Id<"activities"> } | { suggestionId: Id<"suggestions"> } | null;

const AVATAR_COLORS = ["#0e7c66", "#6366f1", "#f97316", "#ec4899", "#0ea5e9", "#8b5cf6", "#16a34a", "#e11d48"];
const colorFor = (id: string) => AVATAR_COLORS[[...id].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_COLORS.length]!;

/**
 * The trip's group chat. Live through Convex: new messages appear as they're
 * sent, and opening the screen marks them read (which clears the badges).
 */
export function TripChatScreen({ tripId, initialLink }: { tripId: Id<"trips">; initialLink: Draft }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const data = useQuery(api.chat.list, { tripId, limit });
  const { data: trip } = useCachedQuery(api.trips.get, { tripId });
  const markRead = useMutation(api.chat.markRead);
  const setMuted = useMutation(api.chat.setMuted);
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const { t } = useI18n();
  // Where they'd read to when the screen opened, so "New messages" stays put while they read.
  const [divider, setDivider] = useState<number | null>(null);
  if (data && divider === null) setDivider(data.readUpTo);

  // Pushes for this chat stay quiet while it's on screen, and reading it marks it read.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setVisibleChat(tripId);
      setFocused(true);
      return () => {
        setVisibleChat(null);
        setFocused(false);
      };
    }, [tripId]),
  );
  const lastId = data?.messages.at(-1)?._id;
  useEffect(() => {
    if (focused && lastId && !lastId.startsWith("pending-")) void markRead({ tripId }).catch(() => undefined);
  }, [focused, lastId, tripId, markRead]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && focused) void markRead({ tripId }).catch(() => undefined);
    });
    return () => sub.remove();
  }, [focused, tripId, markRead]);

  const days = useMemo(() => trip?.subTrips.map((d) => ({ _id: d._id, dayNumber: d.dayNumber, title: d.title, activities: d.activities.map((a) => ({ _id: a._id, title: a.title })) })) ?? [], [trip]);
  // Newest first, for an inverted list that starts at the bottom.
  const rows = useMemo(() => (data ? chatRows(data.messages, divider ?? 0).reverse() : []), [data, divider]);

  /** Back to the itinerary, scrolled to what the message points at. */
  const reveal = (target: FocusTarget) => {
    requestTripFocus({ tripId, target });
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/trips/[tripId]", params: { tripId } });
  };

  const header = (
    <Stack.Screen
      options={{
        title: t("chat.title"),
        headerRight: data
          ? () => (
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  void setMuted({ tripId, muted: !data.muted });
                }}
                accessibilityRole="switch"
                accessibilityState={{ checked: !data.muted }}
                accessibilityLabel={data.muted ? t("chat.unmute") : t("chat.mute")}
                hitSlop={12}
                className="px-2"
              >
                <Icon name={data.muted ? "bellSlash" : "bell"} size={20} colorVar={data.muted ? "--color-muted-foreground" : "--color-primary"} />
              </Pressable>
            )
          : undefined,
      }}
    />
  );

  if (data === undefined)
    return (
      <View className="flex-1 items-center justify-center bg-background">
        {header}
        <ActivityIndicator />
      </View>
    );
  if (data === null)
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        {header}
        <Text className="text-center text-muted-foreground">{t("trip.notFound")}</Text>
      </View>
    );

  return (
    // The iOS header is translucent and this screen has no scroll view to inset itself,
    // so the content starts below the header by hand (and the keyboard offset is 0).
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      style={{ paddingTop: Platform.OS === "ios" ? headerHeight : 0 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {header}
      <View className="border-b border-border bg-card px-4 py-2">
        <Text className="text-center text-xs text-muted-foreground">
          {data.muted ? t("chat.mutedNote") : t("chat.people", { count: data.memberCount })}
        </Text>
      </View>
      {data.messages.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-10">
          <Text className="text-5xl">👋</Text>
          <Text className="text-center leading-5 text-muted-foreground">{t("chat.empty")}</Text>
        </View>
      ) : (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item }) => <Row row={item} canDeleteAny={data.isOwner} onReveal={reveal} />}
          contentContainerClassName="px-3 py-3"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.3}
          onEndReached={() => data.hasMore && setLimit((l) => l + PAGE_SIZE)}
          ListFooterComponent={data.hasMore ? <ActivityIndicator className="my-3" /> : undefined}
        />
      )}
      <Composer tripId={tripId} days={days} initialLink={initialLink} />
    </KeyboardAvoidingView>
  );
}

function Row({ row, canDeleteAny, onReveal }: { row: ChatRow<Message>; canDeleteAny: boolean; onReveal: (target: FocusTarget) => void }) {
  const { t, f } = useI18n();
  if (row.kind === "day") {
    const label = dayLabel(row.date);
    return (
      <View className="my-3 items-center">
        <Text className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground">
          {label === "today" ? t("chat.today") : label === "yesterday" ? t("chat.yesterday") : f.longDay(row.date)}
        </Text>
      </View>
    );
  }
  if (row.kind === "new")
    return (
      <View className="my-3 flex-row items-center gap-2">
        <View className="h-px flex-1 bg-danger/40" />
        <Text className="text-xs font-semibold text-danger">{t("chat.newMessages")}</Text>
        <View className="h-px flex-1 bg-danger/40" />
      </View>
    );
  return <Bubble message={row.message} first={row.first} last={row.last} canDelete={row.message.isMine || canDeleteAny} onReveal={onReveal} />;
}

function Bubble({
  message: m,
  first,
  last,
  canDelete,
  onReveal,
}: {
  message: Message;
  first: boolean;
  last: boolean;
  canDelete: boolean;
  onReveal: (target: FocusTarget) => void;
}) {
  const remove = useMutation(api.chat.remove);
  const { t, f } = useI18n();
  const pending = m._id.startsWith("pending-");
  const name = m.authorIsMember ? m.authorName : t("chat.left", { name: m.authorName });

  const onLongPress =
    canDelete && !m.deleted && !pending
      ? () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Alert.alert(t("chat.deleteConfirm"), undefined, [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("chat.delete"), style: "destructive", onPress: () => void remove({ messageId: m._id }) },
          ]);
        }
      : undefined;

  return (
    <Animated.View entering={FadeIn.duration(180).easing(EASE_OUT)} className={cn("flex-row gap-2", m.isMine && "flex-row-reverse", first ? "mt-3" : "mt-0.5")} style={{ opacity: pending ? 0.6 : 1 }}>
      {!m.isMine && <View className="w-8">{first && <Avatar name={m.authorName} userId={m.authorId} imageUrl={m.authorImageUrl} />}</View>}
      <View className={cn("max-w-[78%]", m.isMine ? "items-end" : "items-start")}>
        {first && !m.isMine && <Text className="mb-0.5 px-1 text-xs font-semibold text-muted-foreground">{name}</Text>}
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={350}
          accessibilityHint={onLongPress ? t("chat.delete") : undefined}
          className={cn(
            "rounded-3xl px-3.5 py-2",
            m.deleted ? "border border-dashed border-border" : m.isMine ? "bg-primary" : "bg-card",
            last && (m.isMine ? "rounded-br-lg" : "rounded-bl-lg"),
          )}
        >
          {m.deleted ? (
            <Text className="italic text-muted-foreground">{t("chat.deleted")}</Text>
          ) : (
            <Text selectable className={cn("text-[16px] leading-[21px]", m.isMine ? "text-primary-foreground" : "text-foreground")}>
              {m.text}
            </Text>
          )}
          {m.link && <LinkCard link={m.link} mine={m.isMine} onReveal={onReveal} />}
        </Pressable>
        {last && <Text className="mt-0.5 px-1 text-[11px] text-muted-foreground">{f.time(localTime(m._creationTime))}</Text>}
      </View>
    </Animated.View>
  );
}

function Avatar({ name, userId, imageUrl }: { name: string; userId: string; imageUrl?: string }) {
  if (imageUrl) return <Image source={{ uri: imageUrl }} className="h-8 w-8 rounded-full" accessibilityIgnoresInvertColors />;
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  return (
    <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: colorFor(userId) }}>
      <Text className="text-xs font-bold text-white">{initials}</Text>
    </View>
  );
}

function LinkCard({ link, mine, onReveal }: { link: NonNullable<Message["link"]>; mine: boolean; onReveal: (target: FocusTarget) => void }) {
  const { t } = useI18n();
  const tone = mine ? "bg-white/15" : "bg-muted";
  const text = mine ? "text-primary-foreground" : "text-foreground";
  if (link.missing)
    return (
      <View className={cn("mt-2 rounded-2xl px-3 py-2", tone)}>
        <Text className={cn("text-xs italic", text)}>{t("chat.linkMissing")}</Text>
      </View>
    );
  const status =
    link.kind === "activity"
      ? link.isCompleted
        ? `✓ ${t("chat.done")}`
        : null
      : { open: t("chat.ideaOpen"), accepted: t("chat.ideaAccepted"), rejected: t("chat.ideaRejected"), withdrawn: t("chat.ideaWithdrawn") }[link.status];
  const label = link.kind === "activity" ? t("chat.linkedStop", { day: link.dayNumber, title: link.title }) : t("chat.linkedIdea", { title: link.title });
  return (
    <Pressable
      onPress={() => onReveal(link.kind === "activity" ? { subTripId: link.subTripId, activityId: link.id } : { ideas: true })}
      accessibilityRole="link"
      accessibilityLabel={label}
      className={cn("mt-2 min-w-56 flex-row items-center gap-2 rounded-2xl px-3 py-2 active:opacity-70", tone)}
    >
      <Text>{link.kind === "activity" ? "📍" : "💡"}</Text>
      <View className="flex-1">
        <Text className={cn("text-sm font-semibold", text)} numberOfLines={2}>
          {label}
        </Text>
        {status && <Text className={cn("text-xs opacity-75", text)}>{status}</Text>}
      </View>
      <Icon name="chevron" size={12} colorVar={mine ? "--color-primary-foreground" : "--color-muted-foreground"} />
    </Pressable>
  );
}

type Day = { _id: Id<"subTrips">; dayNumber: number; title: string; activities: { _id: Id<"activities">; title: string }[] };

function Composer({ tripId, days, initialLink }: { tripId: Id<"trips">; days: Day[]; initialLink: Draft }) {
  const send = useMutation(api.chat.send).withOptimisticUpdate(optimisticSendChat);
  const ideas = useQuery(api.suggestions.forTrip, { tripId });
  const [text, setText] = useState("");
  const [draftLink, setDraftLink] = useState<Draft>(initialLink);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const linked = useMemo(() => {
    if (!draftLink) return null;
    if ("activityId" in draftLink) {
      const day = days.find((d) => d.activities.some((a) => a._id === draftLink.activityId));
      const stop = day?.activities.find((a) => a._id === draftLink.activityId);
      return stop && day ? { icon: "📍", label: t("chat.linkedStop", { day: day.dayNumber, title: stop.title }) } : null;
    }
    const idea = ideas?.open.find((s) => s._id === draftLink.suggestionId) ?? ideas?.decided.find((s) => s._id === draftLink.suggestionId);
    return idea ? { icon: "💡", label: t("chat.linkedIdea", { title: idea.title }) } : null;
  }, [draftLink, days, ideas, t]);

  const tooLong = text.trim().length > MAX_MESSAGE_LENGTH;
  const canSend = text.trim().length > 0 && !tooLong;

  const submit = async () => {
    if (!canSend) return;
    const body = text;
    const link = draftLink;
    setText("");
    setDraftLink(null);
    setPicking(false);
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await send({ tripId, text: body, ...(link ?? {}) });
    } catch {
      setText(body);
      setDraftLink(link);
      setError(t("chat.sendFailed"));
    }
  };

  return (
    <View className="border-t border-border bg-card px-3 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
      {picking && (
        <Animated.View entering={FadeInDown.duration(180).easing(EASE_OUT)} exiting={FadeOutDown.duration(120)} className="mb-2 max-h-72 rounded-3xl bg-muted">
          <ScrollView contentContainerClassName="p-2" keyboardShouldPersistTaps="handled">
            <Text className="px-3 pb-1 pt-2 text-sm font-bold text-foreground">{t("chat.linkTitle")}</Text>
            {(ideas?.open.length ?? 0) === 0 && days.every((d) => d.activities.length === 0) && (
              <Text className="px-3 py-4 text-center text-sm text-muted-foreground">{t("chat.linkNone")}</Text>
            )}
            {ideas && ideas.open.length > 0 && (
              <>
                <Text className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("chat.linkIdeas")}</Text>
                {ideas.open.map((s) => (
                  <PickRow key={s._id} icon="💡" label={s.title} onPress={() => (setDraftLink({ suggestionId: s._id }), setPicking(false), inputRef.current?.focus())} />
                ))}
              </>
            )}
            {days.map((d) =>
              d.activities.length === 0 ? null : (
                <View key={d._id}>
                  <Text className="px-3 pt-2 text-xs font-semibold text-muted-foreground">
                    {t("time.dayN", { day: d.dayNumber })} · {dayTitle(d.title)}
                  </Text>
                  {d.activities.map((a) => (
                    <PickRow key={a._id} icon="📍" label={a.title} onPress={() => (setDraftLink({ activityId: a._id }), setPicking(false), inputRef.current?.focus())} />
                  ))}
                </View>
              ),
            )}
          </ScrollView>
        </Animated.View>
      )}
      {linked && (
        <View className="mb-2 flex-row items-center gap-2 rounded-2xl bg-primary/10 px-3 py-1.5">
          <Text>{linked.icon}</Text>
          <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
            {linked.label}
          </Text>
          <Pressable onPress={() => setDraftLink(null)} accessibilityLabel={t("chat.removeLink")} hitSlop={10}>
            <Text className="text-lg text-muted-foreground">×</Text>
          </Pressable>
        </View>
      )}
      {(error || tooLong) && <Text className="mb-2 text-xs text-danger">{tooLong ? t("chat.tooLong", { max: MAX_MESSAGE_LENGTH }) : error}</Text>}
      <View className="flex-row items-end gap-2">
        <Pressable
          onPress={() => setPicking((p) => !p)}
          accessibilityLabel={t("chat.link")}
          accessibilityState={{ expanded: picking }}
          className={cn("h-10 w-10 items-center justify-center rounded-full", picking ? "bg-foreground" : "bg-muted")}
        >
          <Icon name="paperclip" size={18} colorVar={picking ? "--color-background" : "--color-foreground"} />
        </Pressable>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={t("chat.placeholder")}
          accessibilityLabel={t("chat.placeholder")}
          multiline
          className="max-h-32 min-h-10 flex-1 rounded-3xl border border-border bg-background px-4 py-2.5 text-[16px] text-foreground"
          placeholderTextColorClassName="accent-muted-foreground"
        />
        <Pressable
          onPress={() => void submit()}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={t("chat.send")}
          className={cn("h-10 w-10 items-center justify-center rounded-full bg-primary", !canSend && "opacity-40")}
        >
          <Icon name="send" size={18} colorVar="--color-primary-foreground" />
        </Pressable>
      </View>
    </View>
  );
}

function PickRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-2 rounded-2xl px-3 py-2.5 active:bg-card">
      <Text>{icon}</Text>
      <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
