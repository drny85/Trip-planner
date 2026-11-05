"use client";

import { api } from "@trip/backend/api";
import { CATEGORIES, CATEGORY_TREE, type Category } from "@trip/backend/categories";
import type { Activity } from "@trip/backend/types";
import type { Messages } from "@trip/i18n";
import { useI18n } from "@trip/i18n/react";
import { categoryMeta, cn, subcategoryMeta } from "@trip/ui";
import { useMutation } from "convex/react";
import { useState } from "react";

/** Inline edit form that replaces the activity card while editing. */
export function ActivityEditor({ activity, onDone, compact = false }: { activity: Activity; onDone: () => void; compact?: boolean }) {
  const update = useMutation(api.activities.update);
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();
  const [form, setForm] = useState({
    title: activity.title,
    description: activity.description,
    startTime: activity.startTime ?? "",
    address: activity.address,
    phone: activity.phone ?? "",
    bookingUrl: activity.bookingUrl ?? "",
    category: (activity.category ?? "other") as Category,
    subcategory: activity.subcategory ?? "",
    estimatedCost: activity.estimatedCost?.toString() ?? "",
    actualCost: activity.actualCost?.toString() ?? "",
  });
  const num = (text: string) => (text.trim() === "" || Number.isNaN(Number(text)) ? undefined : Math.max(0, Number(text)));
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await update({
        activityId: activity._id,
        patch: {
          title: form.title.trim(),
          description: form.description.trim(),
          address: form.address.trim(),
          startTime: form.startTime.trim() || undefined,
          phone: form.phone.trim() || undefined,
          bookingUrl: form.bookingUrl.trim() || undefined,
          category: form.category,
          // "" clears it on the server.
          subcategory: form.subcategory,
          estimatedCost: num(form.estimatedCost),
          actualCost: num(form.actualCost),
        },
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const subOptions = CATEGORY_TREE[form.category] as readonly string[];
  const input = "w-full rounded-xl border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary";

  return (
    <form onSubmit={save} onKeyDown={(e) => e.key === "Escape" && onDone()} className={cn("grid gap-3 sm:grid-cols-2", compact ? "p-3" : "p-4")}>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground sm:col-span-2">
        {t("editor.title")}
        <input autoFocus required className={input} {...field("title")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground">
        {t("editor.category")}
        <select
          className={input}
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category, subcategory: "" }))}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryMeta[c].emoji} {t(`categories.${c}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground">
        {t("editor.type")}
        <select className={input} disabled={subOptions.length === 0} {...field("subcategory")}>
          <option value="">{t("editor.any")}</option>
          {subOptions.map((s) => (
            <option key={s} value={s}>
              {subcategoryMeta[s]?.emoji} {t(`subcategories.${s as keyof Messages["subcategories"]}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground sm:col-span-2">
        {t("editor.description")}
        <textarea rows={3} className={input} {...field("description")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground">
        {t("editor.startTime")}
        <input type="time" className={input} {...field("startTime")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground">
        {t("editor.estimatedCost")}
        <input type="number" min={0} step="any" inputMode="decimal" placeholder={t("editor.perPerson")} className={input} {...field("estimatedCost")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground">
        {t("editor.actuallySpent")}
        <input type="number" min={0} step="any" inputMode="decimal" placeholder={t("editor.perPerson")} className={input} {...field("actualCost")} />
      </label>
      {!compact && <>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground">
        {t("editor.phone")}
        <input type="tel" className={input} {...field("phone")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground sm:col-span-2">
        {t("editor.address")}
        <input className={input} {...field("address")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground sm:col-span-2">
        {t("editor.reservationLink")}
        <input type="url" placeholder="https://" className={input} {...field("bookingUrl")} />
      </label>
      </>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onDone} className="rounded-full px-4 py-2 font-semibold text-muted-foreground hover:bg-muted">
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}
