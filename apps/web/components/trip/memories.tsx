"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n } from "@trip/i18n/react";
import { cn, dayTitle } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";

/**
 * Trip memories: photos anyone on the trip adds to an activity. The itinerary
 * loads them once and shares them through context, so each card can show its
 * own photos without its own subscription.
 */
export type Photo = NonNullable<FunctionReturnType<typeof api.memories.forTrip>>[number];

type Ctx = { photos: Photo[]; byActivity: Map<string, Photo[]>; canAdd: boolean; open: (photos: Photo[], index: number) => void };
const MemoriesContext = createContext<Ctx>({ photos: [], byActivity: new Map(), canAdd: false, open: () => {} });
export const useMemories = () => useContext(MemoriesContext);

export function MemoriesProvider({ tripId, enabled, children }: { tripId: Id<"trips">; enabled: boolean; children: React.ReactNode }) {
  const data = useQuery(api.memories.forTrip, enabled ? { tripId } : "skip");
  const [viewer, setViewer] = useState<{ photos: Photo[]; index: number } | null>(null);
  const value = useMemo<Ctx>(() => {
    const photos = data ?? [];
    const byActivity = new Map<string, Photo[]>();
    for (const p of photos) byActivity.set(p.activityId, [...(byActivity.get(p.activityId) ?? []), p]);
    return { photos, byActivity, canAdd: enabled, open: (list, index) => setViewer({ photos: list, index }) };
  }, [data, enabled]);

  return (
    <MemoriesContext.Provider value={value}>
      {children}
      <AnimatePresence>{viewer && <Lightbox key="viewer" {...viewer} onClose={() => setViewer(null)} />}</AnimatePresence>
    </MemoriesContext.Provider>
  );
}

/** Upload one or more photos to an activity. Returns [pick, uploading]. */
export function usePhotoUpload(activityId: Id<"activities">) {
  const generateUploadUrl = useMutation(api.memories.generateUploadUrl);
  const add = useMutation(api.memories.add);
  const input = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(0);
  const { t } = useI18n();

  useEffect(() => {
    const el = document.createElement("input");
    el.type = "file";
    el.accept = "image/*";
    el.multiple = true;
    el.onchange = async () => {
      const files = [...(el.files ?? [])].filter((f) => f.type.startsWith("image/"));
      el.value = "";
      setUploading((n) => n + files.length);
      await Promise.all(
        files.map(async (file) => {
          try {
            const url = await generateUploadUrl();
            const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
            const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
            await add({ activityId, storageId });
          } catch (e) {
            alert(e instanceof Error ? e.message : t("memories.uploadFailed"));
          } finally {
            setUploading((n) => n - 1);
          }
        }),
      );
    };
    input.current = el;
  }, [activityId, add, generateUploadUrl, t]);

  return [() => input.current?.click(), uploading > 0] as const;
}

/** Thumbnails on an activity card plus the "Add photos" button. */
export function ActivityPhotos({ activityId, compact = false }: { activityId: Id<"activities">; compact?: boolean }) {
  const { byActivity, canAdd, open } = useMemories();
  const { t } = useI18n();
  const photos = byActivity.get(activityId) ?? [];
  const [pick, uploading] = usePhotoUpload(activityId);
  if (!canAdd && photos.length === 0) return null;
  const shown = photos.slice(0, compact ? 3 : 4);

  return (
    <div className="flex items-center gap-1.5">
      <AnimatePresence initial={false}>
        {shown.map((p, i) => (
          <motion.button
            key={p._id}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            onClick={() => open(photos, i)}
            className={cn("relative overflow-hidden rounded-xl ring-1 ring-border transition hover:brightness-110 active:scale-95", compact ? "h-9 w-9" : "h-12 w-12")}
            aria-label={t("memories.openPhoto", { n: i + 1, total: photos.length })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Convex storage URL */}
            <img src={p.url} alt={p.caption ?? ""} className="h-full w-full object-cover" />
            {i === shown.length - 1 && photos.length > shown.length && (
              <span className="absolute inset-0 grid place-items-center bg-black/55 text-xs font-bold text-white">+{photos.length - shown.length}</span>
            )}
          </motion.button>
        ))}
      </AnimatePresence>
      {canAdd && (
        <button
          onClick={pick}
          disabled={uploading}
          className={cn(
            "grid place-items-center rounded-xl border-2 border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary disabled:animate-pulse",
            compact ? "h-9 w-9 text-sm" : "h-12 w-12",
          )}
          aria-label={t("memories.addPhotos")}
          title={t("memories.addPhotos")}
        >
          {uploading ? "…" : "📷"}
        </button>
      )}
    </div>
  );
}

/** The trip's photo album, grouped by day. */
export function MemoriesGallery({ subTrips }: { subTrips: { _id: string; dayNumber: number; title: string }[] }) {
  const { photos, open, canAdd } = useMemories();
  const { t } = useI18n();
  if (!canAdd) return null;
  const groups = subTrips
    .map((d) => ({ day: d, photos: photos.filter((p) => p.subTripId === d._id) }))
    .filter((g) => g.photos.length > 0);

  return (
    <motion.section {...rise(0)} className="mt-16" aria-labelledby="memories-title">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("memories.eyebrow")}</p>
      <h2 id="memories-title" className="mt-1 text-3xl font-extrabold tracking-tight">
        {t("memories.title")}
      </h2>
      {groups.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-border p-8 text-center text-muted-foreground">
          📷 {t("memories.empty")}
        </div>
      ) : (
        groups.map(({ day, photos: dayPhotos }) => (
          <div key={day._id} className="mt-6">
            <p className="text-sm font-semibold text-muted-foreground">
              {t("time.dayN", { day: day.dayNumber })} · {dayTitle(day.title)}
            </p>
            <ul className="mt-3 columns-2 gap-3 sm:columns-3 lg:columns-4">
              {dayPhotos.map((p, i) => (
                <motion.li
                  key={p._id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, ease: EASE_OUT, delay: Math.min(i, 6) * 0.04 }}
                  className="mb-3 break-inside-avoid"
                >
                  <button onClick={() => open(dayPhotos, i)} className="group relative block w-full overflow-hidden rounded-2xl">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Convex storage URL */}
                    <img src={p.url} alt={p.caption ?? p.activityTitle} loading="lazy" className="w-full transition duration-500 group-hover:scale-[1.03]" />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-left text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
                      {p.caption ?? p.activityTitle}
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>
          </div>
        ))
      )}
    </motion.section>
  );
}

function Lightbox({ photos, index: start, onClose }: { photos: Photo[]; index: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const { t } = useI18n();
  const [dir, setDir] = useState(0);
  const remove = useMutation(api.memories.remove);
  const setCaption = useMutation(api.memories.setCaption);
  const photo = photos[index];
  const go = (d: number) => {
    setDir(d);
    setIndex((i) => (i + d + photos.length) % photos.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  if (!photo) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label={t("memories.viewer")}
      onClick={onClose}
    >
      <div className="flex items-center justify-between p-4 text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
        <span>
          {t("memories.addedBy", { activity: photo.activityTitle, name: photo.uploaderName, n: index + 1, total: photos.length })}
        </span>
        <div className="flex gap-2">
          {photo.canDelete && (
            <button
              onClick={async () => {
                if (!confirm(t("memories.deleteConfirm"))) return;
                onClose();
                await remove({ memoryId: photo._id });
              }}
              className="rounded-full bg-white/10 px-3 py-1.5 hover:bg-danger"
            >
              {t("common.delete")}
            </button>
          )}
          <button onClick={onClose} className="rounded-full bg-white/10 px-3 py-1.5 hover:bg-white/20" aria-label={t("common.close")}>
            ✕
          </button>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.img
            key={photo._id}
            src={photo.url}
            alt={photo.caption ?? ""}
            custom={dir}
            initial={{ opacity: 0, x: dir * 60, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: dir * -60 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="max-h-[75vh] max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </AnimatePresence>
        {photos.length > 1 && (
          <>
            <button onClick={(e) => (e.stopPropagation(), go(-1))} className="absolute left-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label={t("memories.previous")}>
              ‹
            </button>
            <button onClick={(e) => (e.stopPropagation(), go(1))} className="absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label={t("memories.next")}>
              ›
            </button>
          </>
        )}
      </div>
      <div className="p-4" onClick={(e) => e.stopPropagation()}>
        <input
          key={photo._id}
          defaultValue={photo.caption ?? ""}
          placeholder={t("memories.captionPlaceholder")}
          onBlur={(e) => e.target.value !== (photo.caption ?? "") && void setCaption({ memoryId: photo._id, caption: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="mx-auto block w-full max-w-xl rounded-full bg-white/10 px-4 py-2.5 text-center text-white placeholder:text-white/40 outline-none focus:bg-white/15"
        />
      </div>
    </motion.div>
  );
}
