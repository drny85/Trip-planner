"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { createContext, useContext, useMemo, useState } from "react";
import { StoryView } from "@/components/story/story-view";
import { EASE_OUT, rise } from "@/lib/motion";

/**
 * The trip journal: a short note from each traveler on the things they've done,
 * and the AI-written story of the trip. Notes load once for the whole trip and
 * reach each card through context, like photos do.
 */
type Note = NonNullable<FunctionReturnType<typeof api.journal.notesForTrip>>[number];
type Ctx = { byActivity: Map<string, Note[]>; enabled: boolean };
const JournalContext = createContext<Ctx>({ byActivity: new Map(), enabled: false });

const MAX_NOTE = 500;

export function JournalProvider({ tripId, enabled, children }: { tripId: Id<"trips">; enabled: boolean; children: React.ReactNode }) {
  const notes = useQuery(api.journal.notesForTrip, enabled ? { tripId } : "skip");
  const value = useMemo<Ctx>(() => {
    const byActivity = new Map<string, Note[]>();
    for (const n of notes ?? []) byActivity.set(n.activityId, [...(byActivity.get(n.activityId) ?? []), n]);
    return { byActivity, enabled };
  }, [notes, enabled]);
  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

/** Notes on an activity card, plus "Add a note" once it's done. */
export function ActivityNotes({ activityId, isCompleted, className }: { activityId: Id<"activities">; isCompleted: boolean; className?: string }) {
  const { byActivity, enabled } = useContext(JournalContext);
  const notes = byActivity.get(activityId) ?? [];
  const mine = notes.find((n) => n.isMine);
  const [editing, setEditing] = useState(false);
  if (!enabled || (!isCompleted && notes.length === 0)) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <AnimatePresence initial={false}>
        {notes.map((n) =>
          n.isMine && editing ? null : (
            <motion.figure
              key={n._id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="flex gap-2.5 rounded-2xl bg-muted/70 p-3"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">
                {/* eslint-disable-next-line @next/next/no-img-element -- avatar from the sign-in provider */}
                {n.authorImageUrl ? <img src={n.authorImageUrl} alt="" className="h-full w-full object-cover" /> : initial(n.authorName)}
              </span>
              <div className="min-w-0 flex-1">
                <figcaption className="text-xs font-semibold text-muted-foreground">{n.isMine ? "You" : n.authorName}</figcaption>
                <blockquote className="whitespace-pre-line text-sm">{n.text}</blockquote>
              </div>
              {n.isMine ? (
                <button onClick={() => setEditing(true)} className="self-start text-xs font-semibold text-primary hover:underline">
                  Edit
                </button>
              ) : n.canDelete ? (
                <DeleteNote noteId={n._id} />
              ) : null}
            </motion.figure>
          ),
        )}
      </AnimatePresence>
      {editing ? (
        <NoteEditor activityId={activityId} initialText={mine?.text ?? ""} onDone={() => setEditing(false)} />
      ) : (
        !mine &&
        isCompleted && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            ✍️ Add a note
          </button>
        )
      )}
    </div>
  );
}

function DeleteNote({ noteId }: { noteId: Id<"journalNotes"> }) {
  const remove = useMutation(api.journal.removeNote);
  return (
    <button
      onClick={() => confirm("Delete this note?") && void remove({ noteId })}
      aria-label="Delete note"
      className="self-start text-xs text-muted-foreground hover:text-danger"
    >
      ✕
    </button>
  );
}

function NoteEditor({ activityId, initialText, onDone }: { activityId: Id<"activities">; initialText: string; onDone: () => void }) {
  const save = useMutation(api.journal.saveNote);
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await save({ activityId, text });
      onDone();
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="rounded-2xl border border-border bg-card p-2"
    >
      <textarea
        autoFocus
        value={text}
        maxLength={MAX_NOTE}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          if (e.key === "Escape") onDone();
        }}
        rows={3}
        placeholder="What made it memorable? A taste, a view, a moment…"
        className="w-full resize-none bg-transparent p-2 text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center justify-between gap-2 px-1">
        <span className={cn("text-xs tabular-nums text-muted-foreground", text.length > MAX_NOTE - 40 && "text-danger")}>
          {error ?? `${text.length}/${MAX_NOTE}`}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onDone} className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          {initialText && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setText("");
                void save({ activityId, text: "" }).then(onDone);
              }}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-danger hover:bg-danger/10"
            >
              Delete
            </button>
          )}
          <button type="submit" disabled={busy || text.trim() === initialText.trim()} className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}

const cleanError = (e: unknown) => (e instanceof Error ? (e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] ?? "Something went wrong") : "Something went wrong");

/** "Our story": write it with AI once there's something to tell, read it, and publish it. */
export function TripStory({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.journal.story, { tripId });
  const write = useMutation(api.journal.writeStory);
  const publish = useMutation(api.journal.publishStory);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!data) return null;

  const writing = data.status === "writing";
  const storyUrl = data.shareToken && typeof window !== "undefined" ? `${window.location.origin}/share/${data.shareToken}/story` : null;
  const ask = async () => {
    setError(null);
    await write({ tripId }).catch((e: unknown) => setError(cleanError(e)));
  };
  const copy = async (url: string) => {
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const togglePublish = async (published: boolean) => {
    setError(null);
    try {
      const token = await publish({ tripId, published });
      if (token) await copy(`${window.location.origin}/share/${token}/story`);
    } catch (e) {
      setError(cleanError(e));
    }
  };

  return (
    <motion.section {...rise(0)} className="mt-16" aria-labelledby="story-title">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">Trip journal</p>
      <h2 id="story-title" className="mt-1 text-3xl font-extrabold tracking-tight">
        Our story
      </h2>

      {!data.story && (
        <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-amber-500/10 p-6 sm:p-8">
          <p className="max-w-prose text-muted-foreground">
            {data.completedCount === 0
              ? "Check things off as you go, and add photos and a note to each. When the trip's over, AI turns them into a story you can share, with a map of your route."
              : `${data.completedCount} ${data.completedCount === 1 ? "stop" : "stops"} done and ${data.noteCount} ${data.noteCount === 1 ? "note" : "notes"} so far. ${data.tripEnded ? "Ready when you are." : "You can write it now, or wait until the trip's over and write it again."}`}
          </p>
          <button
            onClick={() => void ask()}
            disabled={writing || data.completedCount === 0}
            className="mt-5 rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-md shadow-primary/25 transition active:scale-[0.97] disabled:opacity-50"
          >
            {writing ? "Writing your story…" : "✨ Write our story"}
          </button>
          {writing && <WritingShimmer />}
        </div>
      )}

      {(error || data.error) && <p className="mt-3 text-sm text-danger">{error ?? data.error}</p>}

      {data.story && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {data.canPublish &&
              (data.isPublished ? (
                <>
                  <span className="rounded-full bg-success/15 px-3 py-1.5 text-sm font-semibold text-success">● Published</span>
                  {storyUrl && (
                    <>
                      <button onClick={() => void copy(storyUrl)} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground active:scale-[0.97]">
                        {copied ? "Copied ✓" : "Copy link"}
                      </button>
                      <Link href={`/share/${data.shareToken}/story`} target="_blank" className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
                        View ↗
                      </Link>
                    </>
                  )}
                  <button onClick={() => void togglePublish(false)} className="rounded-full px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10">
                    Unpublish
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void togglePublish(true)}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.97]"
                  title="Anyone with the trip's share link can read it, with its photos"
                >
                  ↗ Publish and copy link
                </button>
              ))}
            <button onClick={() => void ask()} disabled={writing} className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:animate-pulse">
              {writing ? "Rewriting…" : "↻ Write it again"}
            </button>
          </div>
          {data.canPublish && !data.isPublished && (
            <p className="mt-2 text-xs text-muted-foreground">Publishing puts the story and its photos on the trip&apos;s share link, so anyone with it can read it.</p>
          )}
          <div className={cn("mt-8 rounded-3xl border border-border bg-card p-6 shadow-sm transition sm:p-10", writing && "opacity-60")}>
            <StoryView story={data.story} />
          </div>
        </>
      )}
    </motion.section>
  );
}

function WritingShimmer() {
  return (
    <div className="mt-6 space-y-2" aria-hidden>
      {[92, 100, 76].map((w, i) => (
        <motion.div
          key={i}
          className="h-3 rounded-full bg-primary/15"
          style={{ width: `${w}%` }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}
