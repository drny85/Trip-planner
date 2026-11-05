"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticMove, optimisticRemove, optimisticSetCompleted } from "@trip/backend/optimistic";
import type { Activity } from "@trip/backend/types";
import { categoryLabel, cn, fallbackPhoto, formatDuration } from "@trip/ui";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE_OUT, layoutSpring } from "@/lib/motion";
import { ActivityEditor } from "./activity-editor";

/**
 * The steps nested under an activity, drawn as an indented tree. Each step can
 * have its own steps, to any depth. Owners can add, edit, reorder, indent,
 * outdent, complete and delete them.
 */
export function SubActivities({
  parent,
  readOnly,
  depth = 1,
  adding,
  onAddDone,
}: {
  parent: Activity;
  readOnly: boolean;
  depth?: number;
  adding?: boolean;
  onAddDone?: () => void;
}) {
  if (parent.children.length === 0 && !adding) return null;
  return (
    <ul className={cn("flex flex-col gap-1.5", depth === 1 ? "mt-2 pl-3 sm:pl-6" : "mt-1.5 pl-3 sm:pl-6")}>
      <AnimatePresence initial={false}>
        {parent.children.map((child, index) => (
          <motion.li
            key={child._id}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={layoutSpring}
            className="relative before:absolute before:-left-3 before:top-0 before:h-5 before:w-3 before:rounded-bl-lg before:border-b-2 before:border-l-2 before:border-border sm:before:-left-4 sm:before:w-4"
          >
            <SubActivityRow
              activity={child}
              siblings={parent.children}
              index={index}
              grandparentId={parent.parentId}
              parentIndexInGrandparent={parent.order}
              readOnly={readOnly}
              depth={depth}
            />
          </motion.li>
        ))}
      </AnimatePresence>
      {adding && <QuickAdd parent={parent} onDone={() => onAddDone?.()} />}
    </ul>
  );
}

function SubActivityRow({
  activity,
  siblings,
  index,
  grandparentId,
  parentIndexInGrandparent,
  readOnly,
  depth,
}: {
  activity: Activity;
  siblings: Activity[];
  index: number;
  grandparentId?: Id<"activities">;
  parentIndexInGrandparent: number;
  readOnly: boolean;
  depth: number;
}) {
  const setCompleted = useMutation(api.activities.setCompleted).withOptimisticUpdate(optimisticSetCompleted);
  const move = useMutation(api.activities.move).withOptimisticUpdate(optimisticMove);
  const remove = useMutation(api.activities.remove).withOptimisticUpdate(optimisticRemove);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(true);
  const done = activity.isCompleted;
  const badge = categoryLabel(activity.category, activity.subcategory);
  const day = activity.subTripId;
  const nested = activity.children.length;

  const moveTo = (toParentId: Id<"activities"> | undefined, toIndex: number) =>
    void move({ activityId: activity._id, toSubTripId: day, toParentId, toIndex });

  if (editing)
    return (
      <div className="rounded-2xl border border-border bg-card">
        <ActivityEditor activity={activity} onDone={() => setEditing(false)} compact />
      </div>
    );

  return (
    <>
      <div
        className={cn(
          "group/sub flex flex-wrap items-start gap-x-2.5 gap-y-1 rounded-2xl border border-border/70 bg-card/80 px-3 py-2.5 shadow-xs transition hover:border-border hover:bg-card",
          done && "opacity-60",
        )}
      >
        <motion.button
          role="checkbox"
          aria-checked={done}
          aria-label={`Mark ${activity.title} as ${done ? "not done" : "done"}`}
          disabled={readOnly}
          whileTap={readOnly ? undefined : { scale: 0.85 }}
          onClick={() => void setCompleted({ activityId: activity._id, isCompleted: !done })}
          className={cn(
            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[10px] font-bold transition-colors duration-150",
            done ? "border-success bg-success text-card" : "border-border bg-card",
            !readOnly && !done && "hover:border-primary",
          )}
        >
          <AnimatePresence initial={false}>
            {done && (
              <motion.span
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE_OUT }}
              >
                ✓
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("font-semibold leading-snug", done && "line-through")}>{activity.title}</span>
            <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${badge.color}1f`, color: badge.color }}>
              {badge.emoji} {badge.text}
            </span>
          </div>
          {(activity.startTime || activity.durationMinutes || activity.description) && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {[activity.startTime, activity.durationMinutes ? formatDuration(activity.durationMinutes) : null, activity.description]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {nested > 0 && (
            <button onClick={() => setOpen((o) => !o)} className="mt-1 text-xs font-semibold text-primary hover:underline">
              {open ? "Hide" : "Show"} {nested} {nested === 1 ? "step" : "steps"}
            </button>
          )}
        </div>

        {!readOnly && (
          <div className="-mr-1 flex basis-full justify-end gap-0.5 transition sm:mr-0 sm:basis-auto sm:opacity-0 sm:group-hover/sub:opacity-100 sm:focus-within:opacity-100">
            <SmallButton label="Add a step inside" onClick={() => { setAdding(true); setOpen(true); }}>＋</SmallButton>
            <SmallButton label="Edit" onClick={() => setEditing(true)}>✎</SmallButton>
            <SmallButton label="Move up" disabled={index === 0} onClick={() => moveTo(activity.parentId, index - 1)}>↑</SmallButton>
            <SmallButton label="Move down" disabled={index >= siblings.length - 1} onClick={() => moveTo(activity.parentId, index + 1)}>↓</SmallButton>
            {/* Indent: become the last step of the sibling above. Outdent: sit right after the parent. */}
            <SmallButton label="Nest under the step above" disabled={index === 0} onClick={() => moveTo(siblings[index - 1]!._id, siblings[index - 1]!.children.length)}>⇥</SmallButton>
            <SmallButton label="Move out one level" onClick={() => moveTo(grandparentId, parentIndexInGrandparent + 1)}>⇤</SmallButton>
            <SmallButton
              label="Delete"
              onClick={() => {
                const extra = nested ? ` and its ${nested} ${nested === 1 ? "step" : "steps"}` : "";
                if (confirm(`Delete "${activity.title}"${extra}?`)) void remove({ activityId: activity._id });
              }}
            >
              🗑
            </SmallButton>
          </div>
        )}
      </div>

      {open && <SubActivities parent={activity} readOnly={readOnly} depth={depth + 1} adding={adding} onAddDone={() => setAdding(false)} />}
    </>
  );
}

/** One-line form that adds a step under `parent`, inheriting its category and place. */
export function QuickAdd({ parent, onDone }: { parent: Activity; onDone: () => void }) {
  const create = useMutation(api.activities.create);
  const [title, setTitle] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = title.trim();
    if (!text) return onDone();
    setTitle("");
    await create({
      subTripId: parent.subTripId,
      parentId: parent._id,
      title: text,
      description: "",
      address: parent.address,
      latitude: parent.latitude,
      longitude: parent.longitude,
      category: parent.category,
      subcategory: parent.subcategory,
      photoUrl: fallbackPhoto(`${parent.title}-${text}`),
    });
  };

  return (
    <motion.li initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: EASE_OUT }}>
      <form onSubmit={submit} className="flex gap-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onDone()}
          onBlur={() => !title.trim() && onDone()}
          placeholder={`Add a step to "${parent.title}"…`}
          className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <button type="submit" className="rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
          Add
        </button>
      </form>
    </motion.li>
  );
}

function SmallButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-lg text-xs transition hover:bg-muted active:scale-90 disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}
