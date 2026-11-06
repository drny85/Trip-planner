"use client";

import { useI18n } from "@trip/i18n/react";
import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { groupPacking, PACKING_EMOJI } from "@trip/backend/packing";
import { cn } from "@trip/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";

type Weather = { source: "forecast" | "lastYear"; high: number; low: number; rainyDays: number; snowyDays: number };
type AiState = { status: "idle" } | { status: "working" } | { status: "done"; added: number } | { status: "error"; message: string };

/** "Usually 8° to 18° on these dates · rain on 2 days" */
function useWeatherLine() {
  const { t } = useI18n();
  return (w: Weather) =>
    [
      t(w.source === "forecast" ? "packing.weatherForecast" : "packing.weatherTypical", { low: w.low, high: w.high }),
      w.rainyDays > 0 && t("packing.rainDays", { count: w.rainyDays }),
      w.snowyDays > 0 && t("packing.snowDays", { count: w.snowyDays }),
    ]
      .filter(Boolean)
      .join(" · ");
}

/** One packing list for the whole group: tick things off and claim shared items. */
export function PackingList({ tripId }: { tripId: Id<"trips"> }) {
  const items = useQuery(api.packing.list, { tripId });
  const lastRun = useQuery(api.packing.lastRun, { tripId });
  const generate = useAction(api.ai.generatePackingList);
  const [ai, setAi] = useState<AiState>({ status: "idle" });
  const weatherLine = useWeatherLine();
  const add = useMutation(api.packing.add);
  const addEssentials = useMutation(api.packing.addEssentials);
  const toggle = useMutation(api.packing.toggle);
  const claim = useMutation(api.packing.claim);
  const remove = useMutation(api.packing.remove);
  const [text, setText] = useState("");
  const { t, locale } = useI18n();
  if (!items) return null;

  const packed = items.filter((i) => i.isPacked).length;
  const pct = items.length ? Math.round((packed / items.length) * 100) : 0;
  const sections = groupPacking(items);
  const grouped = sections.length > 1 || sections[0]?.key !== "none";
  const hasAi = items.some((i) => i.isAi);

  const packWithAi = async () => {
    setAi({ status: "working" });
    try {
      const result = await generate({ tripId, language: locale });
      setAi({ status: "done", added: result.added });
    } catch (e) {
      setAi({ status: "error", message: e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : t("packing.aiFailed") });
    }
  };

  return (
    <motion.section {...rise(0)} className="mt-16" aria-labelledby="packing-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("packing.eyebrow")}</p>
          <h2 id="packing-title" className="mt-1 text-3xl font-extrabold tracking-tight">
            {t("packing.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("packing.intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void addEssentials({ tripId, language: locale })} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition hover:bg-muted active:scale-[0.97]">
            ＋ {t("packing.addEssentials")}
          </button>
          <button
            onClick={() => void packWithAi()}
            disabled={ai.status === "working"}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
          >
            {ai.status === "working" ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <span aria-hidden>✨</span>}
            {hasAi ? t("packing.aiMore") : t("packing.aiButton")}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={ai.status}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          role="status"
          className={cn("mt-3 text-sm", ai.status === "error" ? "text-danger" : "text-muted-foreground")}
        >
          {ai.status === "working"
            ? t("packing.aiWorking")
            : ai.status === "error"
              ? ai.message
              : ai.status === "done"
                ? ai.added
                  ? t("packing.aiAdded", { count: ai.added })
                  : t("packing.aiNothingNew")
                : !hasAi && t("packing.aiHint")}
          {ai.status !== "working" && ai.status !== "error" && lastRun?.weather && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
              {lastRun.weather.snowyDays ? "❄️" : lastRun.weather.rainyDays ? "🌧️" : "🌤️"} {weatherLine(lastRun.weather)}
            </span>
          )}
        </motion.p>
      </AnimatePresence>

      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
        {items.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-success" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: EASE_OUT }} />
            </div>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              {t("packing.packed", { done: packed, total: items.length })}
            </span>
          </div>
        )}
        {sections.map((section) => (
          <div key={section.key} className="mb-2 last:mb-0">
            {grouped && (
              <h3 className="mt-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground first:mt-0">
                <span aria-hidden>{section.key === "none" ? "✍️" : PACKING_EMOJI[section.key]}</span>
                {t(`packing.category.${section.key}`)}
              </h3>
            )}
            <ul className="flex flex-col">
              <AnimatePresence initial={false}>
                {section.items.map((item) => (
                  <motion.li
                    key={item._id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: EASE_OUT }}
                    className="group flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
                  >
                    <button
                      onClick={() => void toggle({ itemId: item._id, isPacked: !item.isPacked })}
                      role="checkbox"
                      aria-checked={item.isPacked}
                      aria-label={item.text}
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 text-xs font-bold text-white transition-colors",
                        item.isPacked ? "border-success bg-success" : "border-border hover:border-primary",
                      )}
                    >
                      {item.isPacked && "✓"}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate transition-colors", item.isPacked && "text-muted-foreground line-through")}>
                        {item.text}
                        {item.quantity && <span className="ml-1.5 text-sm font-semibold text-muted-foreground">{t("packing.quantity", { count: item.quantity })}</span>}
                        {item.isAi && (
                          <span className="ml-1.5 text-xs" title={t("packing.aiTag")} aria-label={t("packing.aiTag")}>
                            ✨
                          </span>
                        )}
                      </p>
                      {item.reason && !item.isPacked && <p className="truncate text-xs text-muted-foreground">{item.reason}</p>}
                    </div>
                    <button
                      onClick={() => void claim({ itemId: item._id })}
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition",
                        item.claimedBy
                          ? item.claimedBy.isMe
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                          : item.isGroupItem
                            ? "border border-dashed border-primary/40 text-primary hover:bg-primary/10"
                            : "text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus:opacity-100",
                      )}
                      title={item.isGroupItem && !item.claimedBy ? t("packing.groupItem") : undefined}
                    >
                      {item.claimedBy ? (item.claimedBy.isMe ? t("packing.youBring") : t("packing.theyBring", { name: item.claimedBy.name.split(" ")[0]! })) : t("packing.illBring")}
                    </button>
                    <button
                      onClick={() => void remove({ itemId: item._id })}
                      className="text-sm text-muted-foreground opacity-0 transition hover:text-danger group-hover:opacity-100 focus:opacity-100"
                      aria-label={t("packing.removeItem", { item: item.text })}
                    >
                      ✕
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void add({ tripId, text });
            setText("");
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={items.length ? t("packing.addPlaceholder") : t("packing.emptyPlaceholder")}
            maxLength={120}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground active:scale-[0.97]">
            {t("common.add")}
          </button>
        </form>
      </div>
    </motion.section>
  );
}
