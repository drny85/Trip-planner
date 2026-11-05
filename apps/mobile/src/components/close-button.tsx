import { useI18n } from "@trip/i18n/react";
import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";

/** "Cancel" for a sheet or modal header; closes the screen without saving. */
export function CloseButton({ label: given }: { label?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const label = given ?? t("common.cancel");
  return (
    <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} className="px-1 active:opacity-60">
      <Text className="text-base font-semibold text-primary">{label}</Text>
    </Pressable>
  );
}
