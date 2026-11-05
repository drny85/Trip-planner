import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Share, Text, TextInput, View } from "react-native";
import { Button } from "@/components/button";

const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;

const message = (e: unknown) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : "Something went wrong");

/**
 * Sheet: paste a confirmation email, pick a PDF or a screenshot, or get the
 * trip's forwarding address. AI reads it in the background; the bookings it
 * finds show up on the trip page for review.
 */
export function ImportBooking({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.bookings.forTrip, { tripId });
  const start = useMutation(api.bookings.start);
  const generateUploadUrl = useMutation(api.memories.generateUploadUrl);
  const enableEmail = useMutation(api.bookings.enableEmail);
  const disableEmail = useMutation(api.bookings.disableEmail);
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"text" | "file" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const sendText = async () => {
    setBusy("text");
    setError(null);
    try {
      await start({ tripId, text });
      done();
    } catch (e) {
      setError(message(e));
      setBusy(null);
    }
  };

  const upload = async (uri: string, mimeType: string, name: string, size?: number) => {
    if (!FILE_TYPES.includes(mimeType)) return setError("Pick a PDF or an image (JPG, PNG, WebP).");
    if (size && size > MAX_BYTES) return setError("That file is over 10 MB.");
    setBusy("file");
    setError(null);
    try {
      const url = await generateUploadUrl();
      const body = await (await fetch(uri)).blob();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": mimeType }, body });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await start({ tripId, storageId, fileName: name });
      done();
    } catch (e) {
      setError(message(e));
      setBusy(null);
    }
  };

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    const file = result.canceled ? null : result.assets[0];
    if (file) await upload(file.uri, file.mimeType ?? "application/pdf", file.name, file.size);
  };

  const pickScreenshot = async () => {
    // quality < 1 makes the picker re-encode HEIC photos as JPEG.
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.8 });
    const image = result.canceled ? null : result.assets[0];
    if (image) await upload(image.uri, image.mimeType === "image/png" ? "image/png" : "image/jpeg", image.fileName ?? "Screenshot", image.fileSize);
  };

  const email = data?.email;
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12" keyboardShouldPersistTaps="handled">
      <Text className="text-sm text-muted-foreground">
        Flights, hotels, restaurants, tours. AI finds the times, addresses and confirmation numbers, then you choose which day each one goes on.
      </Text>

      <TextInput
        value={text}
        onChangeText={setText}
        maxLength={60000}
        multiline
        placeholder="Paste the confirmation email here…"
        className="min-h-36 rounded-xl border border-border bg-card px-3 py-2.5 text-base text-foreground"
        textAlignVertical="top"
      />
      <Button icon="sparkles" loading={busy === "text"} disabled={busy !== null || text.trim().length < 20} onPress={() => void sendText()}>
        Read this booking
      </Button>

      <View className="flex-row gap-2">
        <Button variant="secondary" icon="document" containerClassName="flex-1" disabled={busy !== null} loading={busy === "file"} onPress={() => void pickPdf()}>
          PDF or file
        </Button>
        <Button variant="secondary" icon="photo" containerClassName="flex-1" disabled={busy !== null} onPress={() => void pickScreenshot()}>
          Screenshot
        </Button>
      </View>
      {error && <Text className="text-sm text-danger">{error}</Text>}

      {email?.available && email.canManage && (
        <View className="gap-2 rounded-2xl bg-muted p-4">
          <Text className="font-semibold text-foreground">✉️ Or forward confirmations</Text>
          {email.address ? (
            <>
              <Text className="text-sm text-muted-foreground">Forward booking emails to this trip&apos;s address. They show up on the trip page for you to review.</Text>
              <Text selectable className="rounded-lg bg-background px-3 py-2 font-mono text-xs text-foreground">
                {email.address}
              </Text>
              <View className="flex-row gap-2">
                <Button size="sm" icon="share" containerClassName="flex-1" onPress={() => void Share.share({ message: email.address! })}>
                  Share address
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    Alert.alert("Turn off this address?", "Emails sent to it will be ignored.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Turn off", style: "destructive", onPress: () => void disableEmail({ tripId }) },
                    ])
                  }
                >
                  Turn off
                </Button>
              </View>
            </>
          ) : (
            <>
              <Text className="text-sm text-muted-foreground">Get a private email address for this trip and forward confirmations to it.</Text>
              <Button size="sm" variant="secondary" icon="mail" onPress={() => void enableEmail({ tripId }).catch((e: unknown) => setError(message(e)))}>
                Get the address
              </Button>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}
