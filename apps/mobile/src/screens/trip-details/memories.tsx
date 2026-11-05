import { cn } from "@trip/ui";
import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { EASE_OUT } from "@/lib/motion";

/**
 * Trip memories on mobile: one query for the whole trip, shared through context
 * so every card can show its photos. Photos come from the camera or the library.
 */
type Photo = NonNullable<FunctionReturnType<typeof api.memories.forTrip>>[number];
type Ctx = { photos: Photo[]; byActivity: Map<string, Photo[]>; open: (photos: Photo[], index: number) => void };
const MemoriesContext = createContext<Ctx>({ photos: [], byActivity: new Map(), open: () => {} });

export function MemoriesProvider({ tripId, children }: { tripId: Id<"trips">; children: ReactNode }) {
  const data = useQuery(api.memories.forTrip, { tripId });
  const [viewer, setViewer] = useState<{ photos: Photo[]; index: number } | null>(null);
  const value = useMemo<Ctx>(() => {
    const photos = data ?? [];
    const byActivity = new Map<string, Photo[]>();
    for (const p of photos) byActivity.set(p.activityId, [...(byActivity.get(p.activityId) ?? []), p]);
    return { photos, byActivity, open: (list, index) => setViewer({ photos: list, index }) };
  }, [data]);
  return (
    <MemoriesContext.Provider value={value}>
      {children}
      <PhotoViewer viewer={viewer} onClose={() => setViewer(null)} />
    </MemoriesContext.Provider>
  );
}

function usePhotoUpload(activityId: Id<"activities">) {
  const generateUploadUrl = useMutation(api.memories.generateUploadUrl);
  const add = useMutation(api.memories.add);
  const [busy, setBusy] = useState(false);

  const upload = async (assets: ImagePicker.ImagePickerAsset[]) => {
    setBusy(true);
    try {
      for (const asset of assets) {
        const url = await generateUploadUrl();
        const body = await (await fetch(asset.uri)).blob();
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": asset.mimeType ?? "image/jpeg" }, body });
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        await add({ activityId, storageId });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Couldn't add the photo", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const fromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", allowsMultipleSelection: true, selectionLimit: 10, quality: 0.7 });
    if (!result.canceled) await upload(result.assets);
  };
  const fromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Camera access is off", "Turn it on in Settings to take photos here.");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.7 });
    if (!result.canceled) await upload(result.assets);
  };
  const pick = () =>
    Alert.alert("Add a memory", undefined, [
      { text: "Take photo", onPress: () => void fromCamera() },
      { text: "Choose from library", onPress: () => void fromLibrary() },
      { text: "Cancel", style: "cancel" },
    ]);
  return { pick, busy };
}

/** Thumbnails and an add button on an activity card. */
export function ActivityPhotos({ activityId }: { activityId: Id<"activities"> }) {
  const { byActivity, open } = useContext(MemoriesContext);
  const photos = byActivity.get(activityId) ?? [];
  const { pick, busy } = usePhotoUpload(activityId);
  const shown = photos.slice(0, 4);

  return (
    <View className="flex-row items-center gap-1.5 pt-2">
      {shown.map((p, i) => (
        <Animated.View key={p._id} entering={ZoomIn.duration(200).easing(EASE_OUT)}>
          <Pressable onPress={() => open(photos, i)} accessibilityLabel={`Open photo ${i + 1} of ${photos.length}`} className="h-11 w-11 overflow-hidden rounded-xl">
            <Image source={p.url} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
            {i === shown.length - 1 && photos.length > shown.length && (
              <View className="absolute inset-0 items-center justify-center bg-black/55">
                <Text className="text-xs font-bold text-white">+{photos.length - shown.length}</Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      ))}
      <Pressable
        onPress={pick}
        disabled={busy}
        hitSlop={6}
        accessibilityLabel="Add photos"
        className={cn(
          "h-11 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-border active:opacity-70",
          shown.length === 0 ? "px-3" : "w-11",
        )}
      >
        {busy ? <ActivityIndicator size="small" /> : <Text className="text-base">📷</Text>}
        {shown.length === 0 && !busy && <Text className="text-sm font-semibold text-muted-foreground">Add photos</Text>}
      </Pressable>
    </View>
  );
}

/** The trip's photos in a 3-column grid. */
export function MemoriesGallery() {
  const { photos, open } = useContext(MemoriesContext);
  const { width } = useWindowDimensions();
  const size = (width - 32 - 8) / 3;
  return (
    <View className="mt-10 gap-3 px-4">
      <View>
        <Text className="text-xs font-bold uppercase tracking-widest text-primary">Relive it</Text>
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">Memories</Text>
      </View>
      {photos.length === 0 ? (
        <View className="rounded-3xl border border-dashed border-border p-6">
          <Text className="text-center text-sm text-muted-foreground">Tap 📷 on any activity to add photos. They collect here.</Text>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-1">
          {photos.map((p, i) => (
            <Animated.View key={p._id} entering={FadeIn.duration(250).delay(Math.min(i, 9) * 30)}>
              <Pressable onPress={() => open(photos, i)} style={{ width: size, height: size }} className="overflow-hidden rounded-lg">
                <Image source={p.url} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
              </Pressable>
            </Animated.View>
          ))}
        </View>
      )}
    </View>
  );
}

function PhotoViewer({ viewer, onClose }: { viewer: { photos: Photo[]; index: number } | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const remove = useMutation(api.memories.remove);
  const [page, setPage] = useState(0);
  const photo = viewer?.photos[page];

  return (
    <Modal visible={Boolean(viewer)} animationType="fade" transparent onRequestClose={onClose} onShow={() => setPage(viewer?.index ?? 0)}>
      <View className="flex-1 bg-black">
        {viewer && (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: viewer.index * width, y: 0 }}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {viewer.photos.map((p) => (
              <View key={p._id} style={{ width, height }} className="items-center justify-center">
                <Image source={p.url} style={{ width, height: height * 0.75 }} contentFit="contain" transition={150} />
              </View>
            ))}
          </ScrollView>
        )}
        <View className="absolute left-0 right-0 flex-row items-center justify-between px-4" style={{ top: insets.top + 8 }}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
            <Text className="text-lg font-bold text-white">✕</Text>
          </Pressable>
          {photo?.canDelete && (
            <Pressable
              hitSlop={12}
              accessibilityLabel="Delete photo"
              className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
              onPress={() =>
                Alert.alert("Delete this photo?", undefined, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => (onClose(), void remove({ memoryId: photo._id })) },
                ])
              }
            >
              <Icon name="trash" size={16} colorVar="--color-on-image" />
            </Pressable>
          )}
        </View>
        {photo && (
          <View className="absolute left-0 right-0 items-center px-6" style={{ bottom: insets.bottom + 16 }}>
            <Text className="text-center text-base font-semibold text-white">{photo.caption ?? photo.activityTitle}</Text>
            <Text className="text-xs text-white/60">
              Added by {photo.uploaderName} · {page + 1}/{viewer?.photos.length}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
