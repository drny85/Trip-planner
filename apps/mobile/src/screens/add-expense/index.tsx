import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { guessCategory } from "@trip/backend/budgetOverview";
import { CATEGORIES, type Category } from "@trip/backend/categories";
import { useI18n } from "@trip/i18n/react";
import { parseAmount, SPLIT_MODES, type SplitMode } from "@trip/backend/settle";
import { amountText, draftFrom, percentLabel, prefill, readDraft, type Draft } from "@trip/backend/splitDraft";
import { cn, currencyChoices, currencyFromLocales, CURRENCIES } from "@trip/ui";
import { getLocales } from "expo-localization";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button } from "@/components/button";
import { Chips, Field } from "@/components/form";
import { useRate } from "@/lib/use-rate";
import { splitErrorMessage, useSplitText, type SplitData } from "@/screens/trip-details/split-costs";

type ExpenseEntry = Extract<SplitData["entries"][number], { kind: "expense" }>;

/** Sheet for logging (or editing) something one person paid for the group. */
export function AddExpense({ tripId, expenseId }: { tripId: Id<"trips">; expenseId?: Id<"expenses"> }) {
  const data = useQuery(api.expenses.forTrip, { tripId });
  if (!data) return <ActivityIndicator className="mt-10" />;
  const expense = expenseId ? data.entries.find((e): e is ExpenseEntry => e.kind === "expense" && e._id === expenseId) : undefined;
  return <ExpenseForm key={expense?._id ?? "new"} tripId={tripId} data={data} expense={expense} />;
}

function ExpenseForm({ tripId, data, expense }: { tripId: Id<"trips">; data: SplitData; expense?: ExpenseEntry }) {
  const add = useMutation(api.expenses.add);
  const update = useMutation(api.expenses.update);
  const remove = useMutation(api.expenses.remove);
  const router = useRouter();
  const { t, money, firstName } = useSplitText(data);
  const members = data.people.filter((p) => p.isMember);
  const [description, setDescription] = useState(expense?.description ?? "");
  const { category: categoryMeta } = useI18n();
  // Follows the description until they pick one.
  const [picked, setPicked] = useState<Category | null>(expense?.category ?? null);
  const category: Category = picked ?? guessCategory(description);
  const [amount, setAmount] = useState(expense ? amountText(expense.amountCents) : "");
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? data.me);
  const home = data.homeCurrency ?? getLocales()[0]?.currencyCode ?? currencyFromLocales(getLocales().map((l) => l.languageTag));
  const [currency, setCurrency] = useState(expense?.currency ?? home ?? data.localCurrency ?? data.currency);
  const [moreCurrencies, setMoreCurrencies] = useState(false);
  const rate = useRate(currency, data.currency, expense);
  const choices = currencyChoices(home, data.localCurrency, data.currency);
  const tag = (c: string) => (c === home ? t("split.homeTag") : c === data.localCurrency ? t("split.localTag") : null);
  const [draft, setDraft] = useState<Draft>(expense ? draftFrom(expense) : { mode: "equal", people: members.map((m) => m.userId), inputs: {} });
  const [saving, setSaving] = useState(false);
  const cents = parseAmount(amount);
  const reading = readDraft(cents, draft);
  const pickable = [...members.map((m) => m.userId), ...draft.people.filter((id) => !members.some((m) => m.userId === id))];

  const setMode = (mode: SplitMode) => setDraft((d) => ({ ...d, mode, inputs: prefill(mode, d.people, cents) }));
  const toggle = (id: string) =>
    setDraft((d) => {
      const on = d.people.includes(id);
      const people = on ? d.people.filter((x) => x !== id) : pickable.filter((x) => x === id || d.people.includes(x));
      return { ...d, people, inputs: d.mode === "shares" && !on ? { ...d.inputs, [id]: "1" } : d.inputs };
    });

  const status = (() => {
    if (cents == null || draft.people.length === 0) return null;
    const r = reading.remaining;
    if (draft.mode === "exact" && r) return { danger: r < 0, text: r > 0 ? t("split.left", { amount: money(r, currency) }) : t("split.over", { amount: money(-r, currency) }) };
    if (draft.mode === "percent" && r) return { danger: r < 0, text: r > 0 ? t("split.percentLeft", { percent: percentLabel(r) }) : t("split.percentOver", { percent: percentLabel(-r) }) };
    if (draft.mode === "equal") return { danger: false, text: t("split.each", { amount: money(Math.max(...Object.values(reading.preview)), currency) }) };
    return reading.error ? { danger: true, text: t(`split.errors.${reading.error}`) } : null;
  })();

  const submit = async () => {
    if (cents == null || cents <= 0) return Alert.alert(t("mobileSheets.enterAmount"));
    if (!reading.split) return Alert.alert(reading.error === "noPeople" ? t("mobileSheets.pickSplit") : t(`split.errors.${reading.error ?? "badValue"}`));
    if (rate.rate == null) return Alert.alert(t("split.errors.needRate"));
    setSaving(true);
    const fields = { description, amountCents: cents, paidBy, split: reading.split, currency, rate: rate.rate, category };
    try {
      if (expense) await update({ expenseId: expense._id, ...fields });
      else await add({ tripId, ...fields });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert(t("split.couldntAdd"), splitErrorMessage(t, e));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    expense &&
    Alert.alert(expense.description, undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () =>
          void remove({ expenseId: expense._id })
            .then(() => router.back())
            .catch((e: unknown) => Alert.alert(splitErrorMessage(t, e))),
      },
    ]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-background" contentContainerClassName="gap-4 p-5 pb-12" keyboardShouldPersistTaps="handled">
      {expense && <Stack.Screen options={{ title: t("split.editExpense") }} />}
      <Field label={t("split.whatWasIt")} value={description} onChangeText={setDescription} placeholder={t("split.whatPlaceholder")} maxLength={80} autoFocus={!expense} />
      <Field label={t("split.amount", { currency })} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("budgetOverview.expenseCategory")}</Text>
        <Chips
          options={CATEGORIES.map((c) => {
            const meta = categoryMeta(c);
            return { value: c, label: `${meta.emoji} ${meta.text}` };
          })}
          selected={category}
          onSelect={(c) => setPicked(c as Category)}
        />
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("split.currency")}</Text>
        <Chips
          options={[...choices.map((c) => ({ value: c, label: tag(c) ? `${c} · ${tag(c)}` : c })), ...(choices.includes(currency) ? [] : [{ value: currency, label: currency }]), { value: "__more", label: t("split.otherCurrency") }]}
          selected={currency}
          onSelect={(c) => (c === "__more" ? setMoreCurrencies((m) => !m) : setCurrency(c))}
        />
        {moreCurrencies && (
          <Chips
            options={CURRENCIES.filter((c) => !choices.includes(c)).map((c) => ({ value: c, label: c }))}
            selected={currency}
            onSelect={(c) => {
              setCurrency(c);
              setMoreCurrencies(false);
            }}
          />
        )}
        {!rate.same && (
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-sm font-semibold text-foreground">{t("split.rateLabel", { from: currency, to: data.currency })}</Text>
            <TextInput value={rate.text} onChangeText={rate.setText} keyboardType="decimal-pad" className="w-28 rounded-lg border border-border bg-card px-2 py-1.5 text-base text-foreground" />
            <Text className={cn("text-xs", rate.status === "missing" ? "text-danger" : "text-muted-foreground")}>
              {rate.status === "loading" ? t("split.rateLoading") : rate.status === "missing" ? t("split.rateMissing") : rate.date ? t("split.rateHint", { date: rate.date }) : ""}
            </Text>
          </View>
        )}
        {!rate.same && cents != null && rate.rate != null && <Text className="text-sm text-muted-foreground">{t("split.converted", { amount: money(Math.round(cents * rate.rate)) })}</Text>}
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("split.paidBy")}</Text>
        <Chips options={members.map((m) => ({ value: m.userId, label: firstName(m.userId) }))} selected={paidBy} onSelect={setPaidBy} />
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("split.splitBetween")}</Text>
        <View className="flex-row flex-wrap gap-2">
          {pickable.map((id) => {
            const on = draft.people.includes(id);
            return (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggle(id)}
                className={cn("rounded-full border px-3 py-1.5", on ? "border-primary bg-primary" : "border-border bg-card")}
              >
                <Text className={cn("text-sm font-semibold", on ? "text-primary-foreground" : "text-foreground")}>{firstName(id)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">{t("split.splitHow")}</Text>
        <Chips options={SPLIT_MODES.map((m) => ({ value: m, label: t(`split.modes.${m}`) }))} selected={draft.mode} onSelect={(m) => setMode(m as SplitMode)} />
        <Text className="text-xs text-muted-foreground">{t(`split.modeHints.${draft.mode}`)}</Text>
        <View className="gap-1.5 rounded-2xl bg-card p-2">
          {draft.people.map((id) => (
            <View key={id} className="flex-row items-center gap-2 px-2 py-1">
              <Text className="flex-1 font-medium text-foreground" numberOfLines={1}>{firstName(id)}</Text>
              {draft.mode !== "equal" && (
                <View className="flex-row items-center gap-1">
                  <TextInput
                    value={draft.inputs[id] ?? ""}
                    onChangeText={(v) => setDraft((d) => ({ ...d, inputs: { ...d.inputs, [id]: v } }))}
                    keyboardType={draft.mode === "shares" ? "number-pad" : "decimal-pad"}
                    accessibilityLabel={`${firstName(id)} · ${t(`split.modes.${draft.mode}`)}`}
                    className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-base text-foreground"
                  />
                  {draft.mode === "percent" && <Text className="text-muted-foreground">%</Text>}
                </View>
              )}
              <Text className="w-24 text-right text-muted-foreground">{reading.preview[id] != null ? money(reading.preview[id]!, currency) : "–"}</Text>
            </View>
          ))}
        </View>
        {status && <Text className={cn("text-sm", status.danger ? "text-danger" : "text-muted-foreground")}>{status.text}</Text>}
      </View>

      <Button onPress={() => void submit()} loading={saving} icon={expense ? undefined : "plus"} className="mt-2">
        {expense ? t("split.saveChanges") : t("split.addExpense")}
      </Button>
      {expense?.canEdit && (
        <Button variant="danger" onPress={confirmDelete}>
          {t("split.deleteExpense")}
        </Button>
      )}
    </ScrollView>
  );
}
