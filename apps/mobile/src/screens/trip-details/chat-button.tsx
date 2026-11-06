import { api } from "@trip/backend/api";
import { badgeLabel } from "@trip/backend/chat";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";

/** The chat button in the trip's header, over the photo, with an unread badge. */
export function ChatHeaderButton({ tripId }: { tripId: Id<"trips"> }) {
  const unread = useQuery(api.chat.unread, { tripId }) ?? 0;
  const router = useRouter();
  const { t } = useI18n();
  return (
    <PressableScale
      onPress={() => router.push({ pathname: "/trips/[tripId]/chat", params: { tripId } })}
      accessibilityRole="button"
      accessibilityLabel={unread ? t("chat.ariaUnread", { count: unread }) : t("chat.title")}
      hitSlop={8}
      className="h-9 w-9 items-center justify-center rounded-full bg-black/35"
    >
      <Icon name="chat" size={17} colorVar="--color-on-image" />
      {unread > 0 && (
        <Animated.View entering={ZoomIn.springify()} exiting={ZoomOut} className="absolute -right-1.5 -top-1.5 min-w-5 items-center rounded-full bg-danger px-1.5 py-0.5">
          <Text className="text-[10px] font-bold text-white">{badgeLabel(unread)}</Text>
        </Animated.View>
      )}
    </PressableScale>
  );
}

/** A small unread-chat chip for a trip card. */
export function UnreadChatChip({ count }: { count?: number }) {
  const { t } = useI18n();
  if (!count) return null;
  return (
    <View accessible accessibilityLabel={t("chat.ariaUnread", { count })} className="flex-row items-center gap-1 rounded-full bg-danger px-2.5 py-1">
      <Icon name="chat" size={11} colorVar="--color-on-image" />
      <Text className="text-xs font-bold text-white">{badgeLabel(count)}</Text>
    </View>
  );
}
