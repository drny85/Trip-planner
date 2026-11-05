import { cn } from "@trip/ui";
import { Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from "react-native";

/** Shared form pieces for the editor and the suggest-an-idea sheet. */
export function Chips({ options, selected, onSelect }: { options: { value: string; label: string }[]; selected: string; onSelect: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {options.map((o) => {
        const on = o.value === selected;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(o.value)}
            className={cn("rounded-full border px-3 py-1.5", on ? "border-primary bg-primary" : "border-border bg-card")}
          >
            <Text className={cn("text-sm font-semibold", on ? "text-primary-foreground" : "text-foreground")}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Field({ label, className, multiline, ...props }: TextInputProps & { label: string; className?: string }) {
  return (
    <View className={cn("gap-1.5", className)}>
      <Text className="text-sm font-semibold text-muted-foreground">{label}</Text>
      <TextInput
        multiline={multiline}
        className={cn(
          "rounded-xl border border-border bg-card px-3 py-2.5 text-base text-foreground",
          multiline && "min-h-24",
        )}
        placeholderTextColorClassName="accent-muted-foreground"
        textAlignVertical={multiline ? "top" : "center"}
        {...props}
      />
    </View>
  );
}
