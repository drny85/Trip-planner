"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/motion";

/** Share popover: turn the read-only link on or off and copy it. */
export function ShareButton({ tripId, shareToken }: { tripId: Id<"trips">; shareToken?: string }) {
  const share = useMutation(api.trips.share);
  const unshare = useMutation(api.trips.unshare);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const url = shareToken && typeof window !== "undefined" ? `${window.location.origin}/share/${shareToken}` : null;

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

  const copy = async (link: string) => {
    await navigator.clipboard?.writeText(link).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const enable = async () => {
    setBusy(true);
    try {
      const token = await share({ tripId });
      await copy(`${window.location.origin}/share/${token}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition hover:bg-white/30 active:scale-[0.97]"
      >
        <span>↗</span> Share
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 mt-2 w-80 rounded-3xl border border-border bg-card p-4 text-foreground shadow-2xl"
          >
            <p className="font-bold">Share this trip</p>
            <p className="mt-1 text-sm text-muted-foreground">Anyone with the link can view the itinerary. They can&apos;t edit it.</p>
            {url ? (
              <>
                <div className="mt-3 flex gap-2">
                  <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-xl border border-border bg-muted px-3 py-2 text-xs" />
                  <button onClick={() => void copy(url)} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground active:scale-[0.97]">
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await unshare({ tripId }).finally(() => setBusy(false));
                  }}
                  className="mt-3 text-sm font-semibold text-danger hover:underline disabled:opacity-50"
                >
                  Stop sharing
                </button>
              </>
            ) : (
              <button
                disabled={busy}
                onClick={() => void enable()}
                className="mt-3 w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? "Creating link…" : "Create link and copy"}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
