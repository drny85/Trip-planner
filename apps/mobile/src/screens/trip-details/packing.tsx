import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Button } from "@/components/button";
import { CSS_EASE_OUT, EASE_IN_OUT, EASE_OUT } from "@/lib/motion";

/** The group's shared packing list: tick items off, or claim one to bring for everyone. */
export function PackingSection({ tripId }: { tripId: Id<"trips"> }) {
  const items = useQuery(api.packing.list, { tripId });
  const add = useMutation(api.packing.add);
  const addEssentials = useMutation(api.packing.addEssentials);
  const toggle = useMutation(api.packing.toggle);
  const claim = useMutation(api.packing.claim);
  const remove = useMutation(api.packing.remove);
  const [text, setText] = useState("");
  if (!items) return null;

  const packed = items.filter((i) => i.isPacked).length;
  const sorted = [...items].sort((a, b) => Number(a.isPacked) - Number(b.isPacked));
  const submit = () => {
    if (!text.trim()) return;
    void add({ tripId, text });
    setText("");
  };

  return (
    <View className="mt-10 gap-3 px-4">
      <View className="flex-row items-end justify-between">
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">Get ready</Text>
          <Text className="text-2xl font-extrabold tracking-tight text-foreground">Packing list</Text>
          <Text className="text-xs text-muted-foreground">
            {items.length ? `${packed} of ${items.length} packed · shared with everyone` : "Shared with everyone going"}
          </Text>
        </View>
        <Button size="sm" variant="secondary" icon="plus" onPress={() => void addEssentials({ tripId })}>
          Essentials
        </Button>
      </View>

      <View className="rounded-3xl bg-card px-4 py-2 shadow-sm shadow-black/5">
        {sorted.map((item) => (
          <Animated.View
            key={item._id}
            entering={FadeIn.duration(200).easing(EASE_OUT)}
            exiting={FadeOut.duration(150)}
            layout={LinearTransition.duration(240).easing(EASE_IN_OUT)}
            className="flex-row items-center gap-3 border-b border-border/60 py-3"
          >
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                void toggle({ itemId: item._id, isPacked: !item.isPacked });
              }}
              onLongPress={() =>
                Alert.alert(item.text, undefined, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => void remove({ itemId: item._id }) },
                ])
              }
              hitSlop={6}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.isPacked }}
              className="flex-1 flex-row items-center gap-3"
            >
              <View
                className={cn("h-6 w-6 items-center justify-center rounded-lg border-2", item.isPacked ? "border-success bg-success" : "border-border")}
                style={{ transitionProperty: ["backgroundColor", "borderColor"], transitionDuration: 180, transitionTimingFunction: CSS_EASE_OUT }}
              >
                {item.isPacked && <Text className="text-xs font-bold text-white">✓</Text>}
              </View>
              <Text className={cn("flex-1 text-base text-foreground", item.isPacked && "text-muted-foreground line-through")} numberOfLines={1}>
                {item.text}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void claim({ itemId: item._id })}
              hitSlop={8}
              className={cn("rounded-full px-2.5 py-1", item.claimedBy?.isMe ? "bg-primary/10" : "bg-muted")}
            >
              <Text className={cn("text-xs font-semibold", item.claimedBy?.isMe ? "text-primary" : "text-muted-foreground")}>
                {item.claimedBy ? (item.claimedBy.isMe ? "You" : item.claimedBy.name.split(" ")[0]) : "I'll bring"}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="done"
          submitBehavior="submit"
          maxLength={120}
          placeholder={items.length ? "Add something…" : "Add an item, or start with the essentials"}
          className="py-3 text-base text-foreground placeholder:text-muted-foreground"
        />
      </View>
    </View>
  );
}
