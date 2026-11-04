"use client";

import { api } from "@trip/backend/api";
import type { Activity } from "@trip/backend/types";
import { useMutation } from "convex/react";
import { useState } from "react";

/** Inline edit form that replaces the activity card while editing. */
export function ActivityEditor({ activity, onDone }: { activity: Activity; onDone: () => void }) {
  const update = useMutation(api.activities.update);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: activity.title,
    description: activity.description,
    startTime: activity.startTime ?? "",
    address: activity.address,
    phone: activity.phone ?? "",
    bookingUrl: activity.bookingUrl ?? "",
  });
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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
        },
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-xl border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary";

  return (
    <form onSubmit={save} onKeyDown={(e) => e.key === "Escape" && onDone()} className="grid gap-3 p-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground sm:col-span-2">
        Title
        <input autoFocus required className={input} {...field("title")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground sm:col-span-2">
        Description
        <textarea rows={3} className={input} {...field("description")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground">
        Start time
        <input type="time" className={input} {...field("startTime")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground">
        Phone
        <input type="tel" className={input} {...field("phone")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground sm:col-span-2">
        Address
        <input className={input} {...field("address")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted-foreground sm:col-span-2">
        Reservation link
        <input type="url" placeholder="https://" className={input} {...field("bookingUrl")} />
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onDone} className="rounded-full px-4 py-2 font-semibold text-muted-foreground hover:bg-muted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
