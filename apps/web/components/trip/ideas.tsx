"use client";

import { api } from "@trip/backend/api";
import { CATEGORIES, CATEGORY_TREE, type Category } from "@trip/backend/categories";
import type { Id } from "@trip/backend/dataModel";
import type { Messages } from "@trip/i18n";
import { useI18n } from "@trip/i18n/react";
import { categoryMeta, cn, dayTitle, fallbackPhoto, subcategoryMeta } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE_OUT, layoutSpring, rise } from "@/lib/motion";
import { DiscussButton } from "./trip-chat";

type Day = { _id: Id<"subTrips">; dayNumber: number; title: string };

/**
 * Group ideas: anyone on the trip suggests an activity, everyone votes, and it
 * joins the itinerary when more than half say yes.
 */
export function Ideas({ tripId, subTrips }: { tripId: Id<"trips">; subTrips: Day[] }) {
  const data = useQuery(api.suggestions.forTrip, { tripId });
  const [composing, setComposing] = useState(false);
  const { t } = useI18n();
  if (!data) return null;
  const dayName = (id: string) => t("time.dayN", { day: subTrips.find((d) => d._id === id)?.dayNumber ?? "?" });

  return (
    <motion.section {...rise(0)} className="mt-16" aria-labelledby="ideas-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("ideas.eyebrow")}</p>
          <h2 id="ideas-title" className="mt-1 text-3xl font-extrabold tracking-tight">
            {t("ideas.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("ideas.rule", { count: data.memberCount })}</p>
        </div>
        {!composing && (
          <button
            onClick={() => setComposing(true)}
            className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:opacity-90 active:scale-[0.97]"
          >
            💡 {t("ideas.suggest")}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {composing && <SuggestForm key="form" subTrips={subTrips} onDone={() => setComposing(false)} />}
      </AnimatePresence>

      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        <AnimatePresence initial={false} mode="popLayout">
          {data.open.map((s) => (
            <motion.li
              key={s._id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              transition={layoutSpring}
            >
              <IdeaCard idea={s} dayName={dayName(s.subTripId)} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {data.open.length === 0 && !composing && (
        <div className="mt-6 rounded-3xl border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("ideas.empty")}
        </div>
      )}

      {data.decided.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("ideas.recentlyDecided")}</p>
          <ul className="mt-3 flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {data.decided.map((s) => (
                <motion.li
                  key={s._id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-sm shadow-xs"
                >
                  <span className={cn("grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white", s.status === "accepted" ? "bg-success" : "bg-muted-foreground/60")}>
                    {s.status === "accepted" ? "✓" : "✕"}
                  </span>
                  <span className="flex-1 truncate font-semibold">{s.title}</span>
                  <span className="text-muted-foreground">
                    {s.status === "accepted" ? t("ideas.addedTo", { day: dayName(s.subTripId) }) : t("ideas.notEnough")} · {s.tally.yes}–{s.tally.no}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </motion.section>
  );
}

type Idea = NonNullable<FunctionReturnType<typeof api.suggestions.forTrip>>["open"][number];

function IdeaCard({ idea, dayName }: { idea: Idea; dayName: string }) {
  const vote = useMutation(api.suggestions.vote);
  const withdraw = useMutation(api.suggestions.withdraw);
  const { t, f, category } = useI18n();
  const badge = category(idea.category, idea.subcategory);
  const { yes, no, members } = idea.tally;
  const needed = Math.floor(members / 2) + 1;

  return (
    <article id={`idea-${idea._id}`} className="flex h-full scroll-mt-28 flex-col gap-3 rounded-3xl border border-border/70 bg-card p-5 shadow-sm transition-shadow">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
        <span>
          {idea.isMine ? t("ideas.youSuggested", { day: dayName }) : t("ideas.suggestedBy", { name: idea.authorName, day: dayName })}
          {idea.startTime ? ` ${t("ideas.at", { time: f.time(idea.startTime) })}` : ""}
        </span>
        <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${badge.color}1f`, color: badge.color }}>
          {badge.emoji} {badge.text}
        </span>
      </div>
      <h3 className="text-lg font-bold leading-snug">{idea.title}</h3>
      {idea.description && <p className="line-clamp-2 text-sm text-muted-foreground">{idea.description}</p>}

      {/* One segment per traveler: green for yes, red for no, and a marker at the majority line. */}
      <div className="mt-auto">
        <div className="relative flex gap-1" aria-label={t("ideas.tallyAria", { yes, no, needed })}>
          {Array.from({ length: members }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-2 flex-1 rounded-full transition-colors duration-300",
                i < yes ? "bg-success" : i >= members - no ? "bg-danger" : "bg-muted",
                i === needed - 1 && "outline-2 outline-offset-2 outline-success/40",
              )}
            />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("ideas.tally", { yes, no })} · {t("ideas.moreNeeded", { count: idea.yesNeeded })}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {(["yes", "no"] as const).map((value) => {
          const on = idea.myVote === value;
          return (
            <motion.button
              key={value}
              whileTap={{ scale: 0.94 }}
              onClick={() => void vote({ suggestionId: idea._id, value })}
              aria-pressed={on}
              className={cn(
                "flex-1 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                on
                  ? value === "yes"
                    ? "border-success bg-success text-white"
                    : "border-danger bg-danger text-white"
                  : "border-border hover:bg-muted",
              )}
            >
              {value === "yes" ? `👍 ${t("ideas.yes")}` : `👎 ${t("ideas.no")}`}
            </motion.button>
          );
        })}
        <DiscussButton link={{ suggestionId: idea._id }} className="px-3 py-2" />
        {idea.isMine && (
          <button onClick={() => void withdraw({ suggestionId: idea._id })} className="px-2 text-xs font-semibold text-muted-foreground hover:text-danger">
            {t("ideas.withdraw")}
          </button>
        )}
      </div>
      {idea.voters.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {idea.voters.map((v) => `${v.name} ${v.value === "yes" ? "👍" : "👎"}`).join(" · ")}
        </p>
      )}
    </article>
  );
}

function SuggestForm({ subTrips, onDone }: { subTrips: Day[]; onDone: () => void }) {
  const create = useMutation(api.suggestions.create);
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();
  const [form, setForm] = useState({
    title: "",
    description: "",
    address: "",
    subTripId: subTrips[0]?._id ?? "",
    category: "food" as Category,
    subcategory: "",
    startTime: "",
    estimatedCost: "",
  });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const subs = CATEGORY_TREE[form.category] as readonly string[];
  const input = "w-full rounded-xl border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary";
  const label = "flex flex-col gap-1 text-sm font-semibold text-muted-foreground";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.subTripId) return;
    setSaving(true);
    try {
      const cost = Number(form.estimatedCost);
      await create({
        subTripId: form.subTripId as Id<"subTrips">,
        title: form.title.trim(),
        description: form.description.trim(),
        address: form.address.trim(),
        category: form.category,
        subcategory: form.subcategory || undefined,
        startTime: form.startTime || undefined,
        estimatedCost: form.estimatedCost && !Number.isNaN(cost) ? cost : undefined,
        photoUrl: fallbackPhoto(form.title),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && onDone()}
      className="mt-6 overflow-hidden"
    >
      <div className="grid gap-3 rounded-3xl border border-primary/30 bg-card p-5 shadow-lg shadow-primary/5 sm:grid-cols-2">
        <label className={cn(label, "sm:col-span-2")}>
          {t("ideas.whatsTheIdea")}
          <input autoFocus required placeholder={t("ideas.ideaPlaceholder")} className={input} value={form.title} onChange={set("title")} />
        </label>
        <label className={label}>
          {t("ideas.day")}
          <select className={input} value={form.subTripId} onChange={set("subTripId")}>
            {subTrips.map((d) => (
              <option key={d._id} value={d._id}>
                {t("time.dayN", { day: d.dayNumber })} · {dayTitle(d.title)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {t("ideas.time")}
          <input type="time" className={input} value={form.startTime} onChange={set("startTime")} />
        </label>
        <label className={label}>
          {t("editor.category")}
          <select className={input} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category, subcategory: "" }))}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryMeta[c].emoji} {t(`categories.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {t("editor.type")}
          <select className={input} disabled={subs.length === 0} value={form.subcategory} onChange={set("subcategory")}>
            <option value="">{t("editor.any")}</option>
            {subs.map((s) => (
              <option key={s} value={s}>
                {subcategoryMeta[s]?.emoji} {t(`subcategories.${s as keyof Messages["subcategories"]}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={cn(label, "sm:col-span-2")}>
          {t("ideas.whyWorth")}
          <textarea rows={2} className={input} value={form.description} onChange={set("description")} />
        </label>
        <label className={label}>
          {t("editor.address")}
          <input className={input} value={form.address} onChange={set("address")} />
        </label>
        <label className={label}>
          {t("ideas.costPerPerson")}
          <input type="number" min={0} step="any" inputMode="decimal" className={input} value={form.estimatedCost} onChange={set("estimatedCost")} />
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onDone} className="rounded-full px-4 py-2 font-semibold text-muted-foreground hover:bg-muted">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={saving} className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {saving ? t("ideas.posting") : t("ideas.post")}
          </button>
        </div>
      </div>
    </motion.form>
  );
}
