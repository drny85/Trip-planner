"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { optimisticSetCompleted } from "@trip/backend/optimistic";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { EASE_OUT } from "@/lib/motion";

/**
 * "Marked done · Undo" toast. Checking something off happens right away; for a
 * few seconds the toast offers Undo, with a bar that runs down the time left.
 */
const UNDO_MS = 5000;

type Toast = { id: number; message: string; onUndo: () => void };
const UndoContext = createContext<(message: string, onUndo: () => void) => void>(() => {});

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((message: string, onUndo: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, onUndo });
    timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), UNDO_MS);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <UndoContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" role="status" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15, ease: EASE_OUT } }}
              transition={{ type: "spring", duration: 0.3, bounce: 0.1 }}
              className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl bg-foreground text-background shadow-lg"
            >
              <div className="flex items-center gap-3 py-2.5 pl-4 pr-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success text-xs font-bold text-white">✓</span>
                <p className="flex-1 truncate text-sm font-semibold">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => {
                    toast.onUndo();
                    setToast(null);
                  }}
                  className="rounded-full bg-background/15 px-4 py-1.5 text-sm font-bold transition-transform active:scale-[0.97] hover:bg-background/25"
                >
                  Undo
                </button>
              </div>
              <motion.div
                className="h-1 origin-left bg-success"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: UNDO_MS / 1000, ease: "linear" }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </UndoContext.Provider>
  );
}

/** Toggles done with the optimistic update, and offers Undo after marking something done. */
export function useToggleDone() {
  const setCompleted = useMutation(api.activities.setCompleted).withOptimisticUpdate(optimisticSetCompleted);
  const restore = useMutation(api.activities.restoreCompleted);
  const show = useContext(UndoContext);
  return useCallback(
    async (activity: { _id: Id<"activities">; title: string }, isCompleted: boolean) => {
      const changed = await setCompleted({ activityId: activity._id, isCompleted });
      if (isCompleted && changed.length > 0) {
        const steps = changed.length - 1;
        show(`${activity.title} done${steps > 0 ? ` (+${steps} step${steps === 1 ? "" : "s"})` : ""}`, () => void restore({ activityIds: changed, isCompleted: false }));
      }
    },
    [setCompleted, restore, show],
  );
}
