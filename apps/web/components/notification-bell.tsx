"use client";

import { api } from "@trip/backend/api";
import { notificationText } from "@trip/i18n";
import { useI18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/motion";

const ICON = { idea: "💡", accepted: "✅", rejected: "🗳️", joined: "👋", expense: "💸", settled: "🤝", groupPlan: "🗳️", priceDrop: "📉", flightDelay: "⏰", flightGate: "🚪", flightCanceled: "⚠️", fareDrop: "📉", fareTarget: "🎯" } as const;


/** Bell with an unread badge, and a dropdown of what the crew has been up to. */
export function NotificationBell() {
  const feed = useQuery(api.notifications.feed);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t, f } = useI18n();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!feed) return null;
  const toggle = () => {
    setOpen((o) => !o);
    if (!open && feed.unread > 0) void markAllRead();
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={toggle} aria-label={feed.unread ? t("notifications.ariaUnread", { count: feed.unread }) : t("notifications.ariaLabel")} aria-expanded={open} className="relative grid h-9 w-9 place-items-center rounded-full text-lg transition hover:bg-muted active:scale-95">
        🔔
        <AnimatePresence>
          {feed.unread > 0 && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
            >
              {feed.unread > 9 ? "9+" : feed.unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <p className="border-b border-border px-4 py-3 text-sm font-bold">{t("notifications.title")}</p>
            {feed.items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t("notifications.empty")}</p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {feed.items.map((n) => (
                  <li key={n._id}>
                    <Link href={`/trips/${n.tripId}`} onClick={() => setOpen(false)} className={cn("flex gap-3 px-4 py-3 text-sm transition hover:bg-muted", !n.isRead && "bg-primary/5")}>
                      <span aria-hidden>{ICON[n.kind]}</span>
                      <span className="flex-1">{n.params ? notificationText(t, f, n.kind, n.params) : n.text}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{f.ago(n._creationTime)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
