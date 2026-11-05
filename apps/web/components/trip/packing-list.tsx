"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";

/** One packing list for the whole group: tick things off and claim shared items. */
export function PackingList({ tripId }: { tripId: Id<"trips"> }) {
  const items = useQuery(api.packing.list, { tripId });
  const add = useMutation(api.packing.add);
  const addEssentials = useMutation(api.packing.addEssentials);
  const toggle = useMutation(api.packing.toggle);
  const claim = useMutation(api.packing.claim);
  const remove = useMutation(api.packing.remove);
  const [text, setText] = useState("");
  if (!items) return null;

  const packed = items.filter((i) => i.isPacked).length;
  const pct = items.length ? Math.round((packed / items.length) * 100) : 0;
  const sorted = [...items].sort((a, b) => Number(a.isPacked) - Number(b.isPacked));

  return (
    <motion.section {...rise(0)} className="mt-16" aria-labelledby="packing-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Get ready</p>
          <h2 id="packing-title" className="mt-1 text-3xl font-extrabold tracking-tight">
            Packing list
          </h2>
          <p className="text-sm text-muted-foreground">Shared with everyone going. Claim the things you&apos;ll bring for the group.</p>
        </div>
        <button onClick={() => void addEssentials({ tripId })} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition hover:bg-muted active:scale-[0.97]">
          ＋ Add the essentials
        </button>
      </div>

      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
        {items.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-success" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: EASE_OUT }} />
            </div>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              {packed}/{items.length} packed
            </span>
          </div>
        )}
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {sorted.map((item) => (
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
                <span className={cn("flex-1 truncate transition-colors", item.isPacked && "text-muted-foreground line-through")}>{item.text}</span>
                <button
                  onClick={() => void claim({ itemId: item._id })}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold transition",
                    item.claimedBy ? (item.claimedBy.isMe ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground") : "text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus:opacity-100",
                  )}
                >
                  {item.claimedBy ? (item.claimedBy.isMe ? "You're bringing it" : `${item.claimedBy.name.split(" ")[0]} brings it`) : "I'll bring it"}
                </button>
                <button
                  onClick={() => void remove({ itemId: item._id })}
                  className="text-sm text-muted-foreground opacity-0 transition hover:text-danger group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Remove ${item.text}`}
                >
                  ✕
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
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
            placeholder={items.length ? "Add something…" : "Nothing yet. Add an item or start with the essentials."}
            maxLength={120}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground active:scale-[0.97]">
            Add
          </button>
        </form>
      </div>
    </motion.section>
  );
}
