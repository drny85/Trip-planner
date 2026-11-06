"use client";

import { api } from "@trip/backend/api";
import { badgeLabel, chatRows, dayLabel, localTime, MAX_MESSAGE_LENGTH, PAGE_SIZE } from "@trip/backend/chat";
import type { Id } from "@trip/backend/dataModel";
import { optimisticSendChat } from "@trip/backend/optimistic";
import { useI18n } from "@trip/i18n/react";
import { cn, dayTitle } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EASE_OUT } from "@/lib/motion";

type ChatData = NonNullable<FunctionReturnType<typeof api.chat.list>>;
type Message = ChatData["messages"][number];
type Day = { _id: Id<"subTrips">; dayNumber: number; title: string; activities: { _id: Id<"activities">; title: string }[] };
/** What a new message points at. */
type Draft = { activityId: Id<"activities"> } | { suggestionId: Id<"suggestions"> } | null;

const ChatContext = createContext<{ open: (link?: Draft) => void } | null>(null);

/** Lets an activity or idea card open the chat with itself attached. Null outside a trip members can chat on. */
export const useTripChat = () => useContext(ChatContext);

/**
 * The trip's group chat: a floating button with an unread badge, and a panel
 * that slides in from the right (full screen on phones). Only for people on the
 * trip; it's never on share links.
 */
export function TripChat({ tripId, days, children }: { tripId: Id<"trips">; days: Day[]; children: ReactNode }) {
  // `?chat=1` opens it, e.g. from a link in an email or another device.
  const params = useSearchParams();
  const [isOpen, setOpen] = useState(() => Boolean(params.get("chat")));
  const [draftLink, setDraftLink] = useState<Draft>(null);
  const open = useCallback((link?: Draft) => {
    if (link) setDraftLink(link);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <ChatContext.Provider value={value}>
      {children}
      <AnimatePresence>{!isOpen && <Launcher key="launcher" tripId={tripId} onOpen={() => setOpen(true)} />}</AnimatePresence>
      <AnimatePresence>
        {isOpen && <Panel key="panel" tripId={tripId} days={days} draftLink={draftLink} setDraftLink={setDraftLink} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </ChatContext.Provider>
  );
}

function Launcher({ tripId, onOpen }: { tripId: Id<"trips">; onOpen: () => void }) {
  const unread = useQuery(api.chat.unread, { tripId }) ?? 0;
  const { t } = useI18n();
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, scale: 0.8, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 12 }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      whileTap={{ scale: 0.94 }}
      aria-label={unread ? t("chat.ariaUnread", { count: unread }) : t("chat.title")}
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary py-3 pl-4 pr-5 font-semibold text-primary-foreground shadow-xl shadow-primary/30 transition hover:opacity-95"
    >
      <span aria-hidden className="text-lg">💬</span>
      {t("chat.open")}
      <AnimatePresence>
        {unread > 0 && (
          <motion.span
            key={unread}
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.5 }}
            className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white ring-2 ring-background"
          >
            {badgeLabel(unread)}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function Panel({
  tripId,
  days,
  draftLink,
  setDraftLink,
  onClose,
}: {
  tripId: Id<"trips">;
  days: Day[];
  draftLink: Draft;
  setDraftLink: (d: Draft) => void;
  onClose: () => void;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const data = useQuery(api.chat.list, { tripId, limit });
  const markRead = useMutation(api.chat.markRead);
  const setMuted = useMutation(api.chat.setMuted);
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  // Where they'd read to when the panel opened, so "New messages" stays put while they read.
  const [divider, setDivider] = useState<number | null>(null);
  if (data && divider === null) setDivider(data.readUpTo);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  // Reading the panel marks the chat read, including messages that arrive while it's open.
  const lastId = data?.messages.at(-1)?._id;
  useEffect(() => {
    if (lastId && !lastId.startsWith("pending-")) void markRead({ tripId }).catch(() => undefined);
  }, [lastId, tripId, markRead]);

  // Stick to the bottom for new messages; keep the reading position when earlier ones load above.
  const firstId = data?.messages[0]?._id;
  const prevHeight = useRef(0);
  const prevFirst = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !data) return;
    if (prevFirst.current && firstId !== prevFirst.current && prevHeight.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
      const mine = data.messages.at(-1)?.isMine;
      if (nearBottom || mine || !prevHeight.current) el.scrollTop = el.scrollHeight;
    }
    prevHeight.current = el.scrollHeight;
    prevFirst.current = firstId;
  }, [data, firstId]);

  const rows = useMemo(() => (data ? chatRows(data.messages, divider ?? 0) : []), [data, divider]);

  return (
    <motion.aside
      role="dialog"
      aria-label={t("chat.title")}
      initial={reduce ? { opacity: 0 } : { x: "100%" }}
      animate={reduce ? { opacity: 1 } : { x: 0 }}
      exit={reduce ? { opacity: 0 } : { x: "100%" }}
      transition={{ duration: 0.32, ease: EASE_OUT }}
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-2xl sm:w-[26rem]"
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span aria-hidden className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-xl">💬</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold leading-tight">{t("chat.title")}</h2>
          {data && <p className="truncate text-xs text-muted-foreground">{t("chat.people", { count: data.memberCount })}</p>}
        </div>
        {data && (
          <button
            type="button"
            onClick={() => void setMuted({ tripId, muted: !data.muted })}
            aria-pressed={data.muted}
            aria-label={data.muted ? t("chat.unmute") : t("chat.mute")}
            title={data.muted ? t("chat.unmute") : t("chat.mute")}
            className="grid h-9 w-9 place-items-center rounded-full text-lg transition hover:bg-muted active:scale-95"
          >
            {data.muted ? "🔕" : "🔔"}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="grid h-9 w-9 place-items-center rounded-full text-xl transition hover:bg-muted active:scale-95"
        >
          ×
        </button>
      </header>
      {data?.muted && <p className="border-b border-border bg-muted/60 px-4 py-1.5 text-center text-xs text-muted-foreground">{t("chat.mutedNote")}</p>}

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-4" aria-live="polite">
        {data === undefined ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn("h-10 w-2/3 animate-pulse rounded-2xl bg-muted", i === 1 && "self-end")} />
            ))}
          </div>
        ) : data === null ? null : data.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
            <span className="text-5xl">👋</span>
            <p className="text-sm">{t("chat.empty")}</p>
          </div>
        ) : (
          <>
            {data.hasMore && (
              <div className="mb-3 text-center">
                <button type="button" onClick={() => setLimit((l) => l + PAGE_SIZE)} className="rounded-full bg-muted px-4 py-1.5 text-xs font-semibold transition hover:bg-border">
                  {t("chat.earlier")}
                </button>
              </div>
            )}
            <ol className="flex flex-col">
              {rows.map((row) =>
                row.kind === "day" ? (
                  <li key={row.key} className="my-3 text-center">
                    <DayLine date={row.date} />
                  </li>
                ) : row.kind === "new" ? (
                  <li key={row.key} className="my-3 flex items-center gap-2 text-xs font-semibold text-danger">
                    <span className="h-px flex-1 bg-danger/40" />
                    {t("chat.newMessages")}
                    <span className="h-px flex-1 bg-danger/40" />
                  </li>
                ) : (
                  <Bubble key={row.key} message={row.message} first={row.first} last={row.last} canDelete={row.message.isMine || data.isOwner} onNavigate={onClose} />
                ),
              )}
            </ol>
          </>
        )}
      </div>

      {data && <Composer tripId={tripId} days={days} draftLink={draftLink} setDraftLink={setDraftLink} />}
    </motion.aside>
  );
}

function DayLine({ date }: { date: string }) {
  const { t, f } = useI18n();
  const label = dayLabel(date);
  return (
    <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground">
      {label === "today" ? t("chat.today") : label === "yesterday" ? t("chat.yesterday") : f.longDay(date)}
    </span>
  );
}

function Bubble({ message: m, first, last, canDelete, onNavigate }: { message: Message; first: boolean; last: boolean; canDelete: boolean; onNavigate: () => void }) {
  const remove = useMutation(api.chat.remove);
  const { t, f } = useI18n();
  const pending = m._id.startsWith("pending-");
  const name = m.authorIsMember ? m.authorName : t("chat.left", { name: m.authorName });
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: pending ? 0.6 : 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      className={cn("group flex gap-2", m.isMine ? "flex-row-reverse" : "flex-row", first ? "mt-3" : "mt-0.5")}
    >
      {!m.isMine && (
        <span className="w-8 shrink-0">{first && <Avatar name={m.authorName} userId={m.authorId} imageUrl={m.authorImageUrl} />}</span>
      )}
      <div className={cn("flex max-w-[78%] flex-col", m.isMine ? "items-end" : "items-start")}>
        {first && !m.isMine && <span className="mb-0.5 px-1 text-xs font-semibold text-muted-foreground">{name}</span>}
        <div className="flex items-center gap-1">
          {canDelete && !m.deleted && !pending && (
            <button
              type="button"
              aria-label={t("chat.delete")}
              title={t("chat.delete")}
              onClick={() => confirm(t("chat.deleteConfirm")) && void remove({ messageId: m._id })}
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs opacity-0 transition hover:bg-muted focus:opacity-100 group-hover:opacity-100",
                m.isMine ? "order-first" : "order-last",
              )}
            >
              🗑
            </button>
          )}
          <div
            className={cn(
              "rounded-3xl px-3.5 py-2 text-[15px] leading-snug",
              m.deleted
                ? "border border-dashed border-border italic text-muted-foreground"
                : m.isMine
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              m.isMine ? (last ? "rounded-br-lg" : "") : last ? "rounded-bl-lg" : "",
            )}
          >
            {m.deleted ? t("chat.deleted") : <p className="whitespace-pre-wrap break-words">{m.text}</p>}
            {m.link && <LinkCard link={m.link} mine={m.isMine} onNavigate={onNavigate} />}
          </div>
        </div>
        {last && <span className="mt-0.5 px-1 text-[11px] tabular-nums text-muted-foreground">{f.time(localTime(m._creationTime))}</span>}
      </div>
    </motion.li>
  );
}

const AVATAR_COLORS = ["#0e7c66", "#6366f1", "#f97316", "#ec4899", "#0ea5e9", "#8b5cf6", "#16a34a", "#e11d48"];
const colorFor = (id: string) => AVATAR_COLORS[[...id].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

function Avatar({ name, userId, imageUrl }: { name: string; userId: string; imageUrl?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a 32px avatar from Clerk; next/image would need its host allow-listed
  if (imageUrl) return <img src={imageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />;
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  return (
    <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: colorFor(userId) }}>
      {initials}
    </span>
  );
}

/** Scrolls the itinerary to a stop or idea and flashes it, so a chat link lands you on the thing. */
function revealOnPage(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return false;
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  el.classList.add("chat-flash");
  window.setTimeout(() => el.classList.remove("chat-flash"), 1800);
  return true;
}

function LinkCard({ link, mine, onNavigate }: { link: NonNullable<Message["link"]>; mine: boolean; onNavigate: () => void }) {
  const { t } = useI18n();
  const tone = mine ? "bg-white/15 hover:bg-white/25" : "bg-card hover:bg-background";
  if (link.missing) return <p className={cn("mt-2 rounded-2xl px-3 py-2 text-xs italic", mine ? "bg-white/10" : "bg-card")}>{t("chat.linkMissing")}</p>;
  const go = () => {
    const id = link.kind === "activity" ? `activity-${link.id}` : `idea-${link.id}`;
    // On a phone the panel covers the page, so get out of the way first.
    if (window.matchMedia("(max-width: 639px)").matches) onNavigate();
    window.setTimeout(() => revealOnPage(id), 50);
  };
  const status =
    link.kind === "activity"
      ? link.isCompleted
        ? `✓ ${t("chat.done")}`
        : null
      : { open: t("chat.ideaOpen"), accepted: t("chat.ideaAccepted"), rejected: t("chat.ideaRejected"), withdrawn: t("chat.ideaWithdrawn") }[link.status];
  return (
    <button type="button" onClick={go} className={cn("mt-2 flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition", tone)}>
      <span aria-hidden>{link.kind === "activity" ? "📍" : "💡"}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {link.kind === "activity" ? t("chat.linkedStop", { day: link.dayNumber, title: link.title }) : t("chat.linkedIdea", { title: link.title })}
        </span>
        {status && <span className="block text-xs opacity-75">{status}</span>}
      </span>
      <span aria-hidden className="opacity-70">→</span>
    </button>
  );
}

function Composer({ tripId, days, draftLink, setDraftLink }: { tripId: Id<"trips">; days: Day[]; draftLink: Draft; setDraftLink: (d: Draft) => void }) {
  const send = useMutation(api.chat.send).withOptimisticUpdate(optimisticSendChat);
  const ideas = useQuery(api.suggestions.forTrip, { tripId });
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    inputRef.current?.focus();
  }, [draftLink]);

  // Grow with the text, up to a few lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const linked = useMemo(() => {
    if (!draftLink) return null;
    if ("activityId" in draftLink) {
      const day = days.find((d) => d.activities.some((a) => a._id === draftLink.activityId));
      const stop = day?.activities.find((a) => a._id === draftLink.activityId);
      return stop && day ? { icon: "📍", label: t("chat.linkedStop", { day: day.dayNumber, title: stop.title }) } : null;
    }
    const idea = ideas?.open.find((s) => s._id === draftLink.suggestionId) ?? ideas?.decided.find((s) => s._id === draftLink.suggestionId);
    return idea ? { icon: "💡", label: t("chat.linkedIdea", { title: idea.title }) } : null;
  }, [draftLink, days, ideas, t]);

  const tooLong = text.trim().length > MAX_MESSAGE_LENGTH;
  const canSend = text.trim().length > 0 && !tooLong;

  const submit = async () => {
    if (!canSend) return;
    const body = text;
    const link = draftLink;
    setText("");
    setDraftLink(null);
    setPicking(false);
    setError(null);
    try {
      await send({ tripId, text: body, ...(link ?? {}) });
    } catch {
      setText(body);
      setDraftLink(link);
      setError(t("chat.sendFailed"));
    }
  };

  return (
    <div className="relative border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <AnimatePresence>
        {picking && (
          <LinkPicker
            days={days}
            ideas={ideas?.open ?? []}
            onPick={(d) => {
              setDraftLink(d);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}
      </AnimatePresence>
      {linked && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-primary/10 px-3 py-1.5 text-sm">
          <span aria-hidden>{linked.icon}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{linked.label}</span>
          <button type="button" onClick={() => setDraftLink(null)} aria-label={t("chat.removeLink")} className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-card">
            ×
          </button>
        </div>
      )}
      {(error || tooLong) && <p className="mb-2 text-xs text-danger">{tooLong ? t("chat.tooLong", { max: MAX_MESSAGE_LENGTH }) : error}</p>}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          aria-label={t("chat.link")}
          aria-expanded={picking}
          title={t("chat.link")}
          className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg transition active:scale-95", picking ? "bg-foreground text-background" : "bg-muted hover:bg-border")}
        >
          📎
        </button>
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter adds a line. Never while an IME (Japanese input) is composing.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.placeholder")}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-3xl border border-border bg-background px-4 py-2 text-[15px] leading-snug outline-none transition focus:border-primary"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={t("chat.send")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-md shadow-primary/25 transition hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:shadow-none"
        >
          ↑
        </button>
      </form>
    </div>
  );
}

type Idea = NonNullable<FunctionReturnType<typeof api.suggestions.forTrip>>["open"][number];

function LinkPicker({ days, ideas, onPick, onClose }: { days: Day[]; ideas: Idea[]; onPick: (d: Draft) => void; onClose: () => void }) {
  const { t } = useI18n();
  const empty = ideas.length === 0 && days.every((d) => d.activities.length === 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      className="absolute inset-x-3 bottom-full mb-2 max-h-[22rem] overflow-y-auto rounded-3xl border border-border bg-card p-2 shadow-2xl"
      role="listbox"
      aria-label={t("chat.linkTitle")}
      onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onClose())}
    >
      <p className="px-3 pb-1 pt-2 text-sm font-bold">{t("chat.linkTitle")}</p>
      {empty && <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t("chat.linkNone")}</p>}
      {ideas.length > 0 && (
        <>
          <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("chat.linkIdeas")}</p>
          {ideas.map((s) => (
            <PickRow key={s._id} icon="💡" label={s.title} onClick={() => onPick({ suggestionId: s._id })} />
          ))}
        </>
      )}
      {days.some((d) => d.activities.length > 0) && <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("chat.linkStops")}</p>}
      {days.map((d) =>
        d.activities.length === 0 ? null : (
          <div key={d._id}>
            <p className="px-3 pt-2 text-xs font-semibold text-muted-foreground">
              {t("time.dayN", { day: d.dayNumber })} · {dayTitle(d.title)}
            </p>
            {d.activities.map((a) => (
              <PickRow key={a._id} icon="📍" label={a.title} onClick={() => onPick({ activityId: a._id })} />
            ))}
          </div>
        ),
      )}
    </motion.div>
  );
}

function PickRow({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={false} onClick={onClick} className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition hover:bg-muted">
      <span aria-hidden>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/** "💬 Discuss" on an activity or idea card: opens the chat with it attached. */
export function DiscussButton({ link, className }: { link: NonNullable<Draft>; className?: string }) {
  const chat = useTripChat();
  const { t } = useI18n();
  if (!chat) return null;
  return (
    <button
      type="button"
      onClick={() => chat.open(link)}
      className={cn("rounded-full bg-muted px-3.5 py-1.5 text-sm font-semibold transition hover:bg-border active:scale-[0.96]", className)}
    >
      💬 {t("chat.discuss")}
    </button>
  );
}

/** A small unread-chat count for a trip card. */
export function UnreadChatBadge({ count }: { count?: number }) {
  const { t } = useI18n();
  if (!count) return null;
  return (
    <span aria-label={t("chat.ariaUnread", { count })} className="inline-flex items-center gap-1 rounded-full bg-danger px-2.5 py-1 text-xs font-bold text-white shadow-md">
      💬 {badgeLabel(count)}
    </span>
  );
}
