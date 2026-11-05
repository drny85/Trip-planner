"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { useI18n, type I18n } from "@trip/i18n/react";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";

/**
 * Booking import: paste a confirmation email, drop a PDF or screenshot, or
 * forward the email to the trip's address. AI reads it, and the traveler picks
 * which bookings to add and to which day before anything changes.
 */
type Data = NonNullable<FunctionReturnType<typeof api.bookings.forTrip>>;
type Booking = Data["bookings"][number];
type Import = Data["imports"][number];
type Day = { _id: Id<"subTrips">; dayNumber: number; date?: string; title: string; activities: { _id: Id<"activities">; title: string }[] };

const KIND_EMOJI: Record<Booking["kind"], string> = {
  flight: "✈️",
  train: "🚆",
  bus: "🚌",
  ferry: "⛴️",
  car: "🚗",
  hotel: "🏨",
  restaurant: "🍽️",
  tour: "🎟️",
  event: "🎭",
  other: "📄",
};
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;

const Ctx = createContext<{ data: Data | null | undefined; byActivity: Map<string, Booking> }>({ data: undefined, byActivity: new Map() });

/** Loads the trip's bookings once, for the section and the chips on each activity. */
export function BookingsProvider({ tripId, enabled, children }: { tripId: Id<"trips">; enabled: boolean; children: React.ReactNode }) {
  const data = useQuery(api.bookings.forTrip, enabled ? { tripId } : "skip");
  const value = useMemo(() => {
    const byActivity = new Map<string, Booking>();
    for (const b of data?.bookings ?? []) if (b.activityId) byActivity.set(b.activityId, b);
    return { data, byActivity };
  }, [data]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** "Booked · K7Q2PX" on an activity that has a confirmation. Click copies the code. */
export function BookingChip({ activityId }: { activityId: string }) {
  const { t } = useI18n();
  const booking = useContext(Ctx).byActivity.get(activityId);
  const [copied, setCopied] = useState(false);
  if (!booking) return null;
  return (
    <button
      onClick={() => {
        if (!booking.confirmationCode) return;
        void navigator.clipboard?.writeText(booking.confirmationCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={booking.confirmationCode ? t("bookings.copyCode") : booking.provider}
      className="rounded-md bg-success/15 px-2 py-0.5 text-success transition hover:bg-success/25"
    >
      {copied ? t("bookings.copied") : `🎫 ${t("bookings.booked")}${booking.confirmationCode ? ` · ${booking.confirmationCode}` : ""}`}
    </button>
  );
}

const when = (f: I18n["f"], b: { startDate?: string; startTime?: string }) => [b.startDate && f.day(b.startDate), b.startTime && f.time(b.startTime)].filter(Boolean).join(" · ");

export function Bookings({ tripId, days }: { tripId: Id<"trips">; days: Day[] }) {
  const { t } = useI18n();
  const { data } = useContext(Ctx);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  if (!data) return null;
  const { bookings, imports } = data;
  const shown = showAll ? bookings : bookings.slice(0, 4);

  return (
    <motion.section {...rise(0)} className="mt-6 rounded-3xl border border-border/70 bg-card p-5 shadow-sm" aria-labelledby="bookings-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="bookings-title" className="text-lg font-bold">
            🎫 {t("bookings.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {bookings.length ? t("bookings.confirmed", { count: bookings.length }) + "." : t("bookings.none")} {t("bookings.intro")}
          </p>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:opacity-90 active:scale-[0.97]">
          ＋ {t("bookings.importButton")}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {imports.map((imp) => (
          <motion.div key={imp._id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: EASE_OUT }}>
            <ImportCard imp={imp} days={days} />
          </motion.div>
        ))}
      </AnimatePresence>

      {bookings.length > 0 && (
        <ul className="mt-4 flex flex-col">
          {shown.map((b) => (
            <SavedBooking key={b._id} booking={b} />
          ))}
        </ul>
      )}
      {bookings.length > 4 && (
        <button onClick={() => setShowAll((s) => !s)} className="mt-2 text-sm font-semibold text-primary">
          {showAll ? t("bookings.showFewer") : t("bookings.showAll", { count: bookings.length })}
        </button>
      )}

      <AnimatePresence>{open && <ImportDialog key="import" tripId={tripId} email={data.email} onClose={() => setOpen(false)} />}</AnimatePresence>
    </motion.section>
  );
}

function SavedBooking({ booking: b }: { booking: Booking }) {
  const { t, f } = useI18n();
  const remove = useMutation(api.bookings.remove);
  const [copied, setCopied] = useState(false);
  return (
    <li className="group flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
      <span className="text-xl" aria-hidden>
        {KIND_EMOJI[b.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{b.title}</p>
        <p className="truncate text-xs text-muted-foreground">{[when(f, b), b.provider, b.details].filter(Boolean).join(" · ")}</p>
      </div>
      {b.confirmationCode && (
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(b.confirmationCode!);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title={t("bookings.copyCode")}
          className="rounded-lg bg-muted px-2.5 py-1 font-mono text-xs font-semibold tabular-nums transition hover:bg-border"
        >
          {copied ? t("bookings.copied") : b.confirmationCode}
        </button>
      )}
      {b.bookingUrl && (
        <a href={b.bookingUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline">
          {t("bookings.manage")}
        </a>
      )}
      <button
        onClick={() => confirm(t("bookings.removeConfirm", { title: b.title })) && void remove({ bookingId: b._id })}
        className="text-sm text-muted-foreground opacity-0 transition hover:text-danger group-hover:opacity-100 focus:opacity-100"
        aria-label={t("bookings.removeLabel", { title: b.title })}
      >
        ✕
      </button>
    </li>
  );
}

type Choice = { include: boolean; subTripId?: Id<"subTrips">; activityId?: Id<"activities"> };

function ImportCard({ imp, days }: { imp: Import; days: Day[] }) {
  const { t } = useI18n();
  const dismiss = useMutation(api.bookings.dismiss);
  const label = imp.source === "email" ? `✉️ ${imp.subject ?? t("bookings.forwarded")}` : imp.fileName ? `📎 ${imp.fileName}` : `📋 ${t("bookings.pasted")}`;

  if (imp.status === "processing")
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{t("bookings.reading")}</span> <span className="text-muted-foreground">{label}</span>
        </span>
      </div>
    );

  if (imp.status === "failed")
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm">
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-danger">{imp.error ?? t("bookings.errRefused")}</span> <span className="text-muted-foreground">{label}</span>
        </span>
        <button onClick={() => void dismiss({ importId: imp._id })} className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
          {t("bookings.dismiss")}
        </button>
      </div>
    );

  return <ReadyImport imp={imp} days={days} label={label} />;
}

/** Mounted once the proposals are in, so the choices start from them. */
function ReadyImport({ imp, days, label }: { imp: Import; days: Day[]; label: string }) {
  const { t, f } = useI18n();
  const apply = useMutation(api.bookings.apply);
  const dismiss = useMutation(api.bookings.dismiss);
  const proposals = imp.proposals ?? [];
  const [choices, setChoices] = useState<Choice[]>(() =>
    proposals.map((p) => ({ include: true, subTripId: p.placement.subTripId ?? days[0]?._id, activityId: p.placement.activityId })),
  );
  const [busy, setBusy] = useState(false);
  const picked = choices.filter((c) => c.include && c.subTripId).length;
  return (
    <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm">
        <span className="font-semibold">{t("bookings.found", { count: proposals.length })}</span>{" "}
        <span className="text-muted-foreground">{t("bookings.checkWhere", { source: label.replace(/^\S+ /, "") })}</span>
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {proposals.map(({ booking: b, placement }, i) => {
          const c = choices[i];
          if (!c) return null;
          const set = (patch: Partial<Choice>) => setChoices((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          const day = days.find((d) => d._id === c.subTripId);
          const attachedTo = c.activityId && day?.activities.find((a) => a._id === c.activityId);
          return (
            <li key={i} className={cn("rounded-xl border border-border bg-card p-3 transition-opacity", !c.include && "opacity-50")}>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={c.include} onChange={(e) => set({ include: e.target.checked })} className="mt-1 h-4 w-4 accent-[var(--color-primary)]" />
                <span className="text-xl" aria-hidden>
                  {KIND_EMOJI[b.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{b.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[when(f, b), b.confirmationCode && `#${b.confirmationCode}`, b.provider].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-7 text-xs">
                <select
                  value={c.subTripId ?? ""}
                  onChange={(e) => {
                    const subTripId = e.target.value as Id<"subTrips">;
                    // The suggested activity only applies on its own day.
                    set({ subTripId, activityId: subTripId === placement.subTripId ? placement.activityId : undefined });
                  }}
                  aria-label={t("bookings.dayFor", { title: b.title })}
                  className="rounded-lg border border-border bg-background px-2 py-1 font-semibold outline-none focus:border-primary"
                >
                  {days.map((d) => (
                    <option key={d._id} value={d._id}>
                      {t("time.dayN", { day: d.dayNumber })}
                      {d.date ? ` · ${f.day(d.date)}` : ""}
                    </option>
                  ))}
                </select>
                {attachedTo ? (
                  <span className="text-muted-foreground">
                    {t("bookings.addsTo", { title: attachedTo.title })}{" "}
                    <button onClick={() => set({ activityId: undefined })} className="font-semibold text-primary hover:underline">
                      {t("bookings.newInstead")}
                    </button>
                  </span>
                ) : (
                  <span className="text-muted-foreground">{b.startTime ? t("bookings.newStopAt", { time: f.time(b.startTime) }) : t("bookings.newStop")}</span>
                )}
                {placement.outsideTrip && c.subTripId === placement.subTripId && <span className="text-amber-600 dark:text-amber-400">{t("bookings.outside")}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex gap-2">
        <button onClick={() => void dismiss({ importId: imp._id })} className="rounded-full bg-muted px-4 py-2 text-sm font-semibold">
          {t("bookings.dismiss")}
        </button>
        <button
          disabled={busy || picked === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await apply({
                importId: imp._id,
                items: choices.flatMap((c, index) => (c.include && c.subTripId ? [{ index, subTripId: c.subTripId, activityId: c.activityId }] : [])),
              });
            } catch (e) {
              alert(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : t("bookings.couldntAdd"));
              setBusy(false);
            }
          }}
          className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? t("bookings.adding") : t("bookings.add", { count: picked })}
        </button>
      </div>
    </div>
  );
}

function ImportDialog({ tripId, email, onClose }: { tripId: Id<"trips">; email: Data["email"]; onClose: () => void }) {
  const { t, locale } = useI18n();
  const start = useMutation(api.bookings.start);
  const generateUploadUrl = useMutation(api.memories.generateUploadUrl);
  const [text, setText] = useState("");
  const [state, setState] = useState<{ status: "idle" | "sending" } | { status: "error"; message: string }>({ status: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const fail = (e: unknown) => setState({ status: "error", message: e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : t("common.somethingWrong") });

  const sendText = async () => {
    setState({ status: "sending" });
    try {
      await start({ tripId, text, language: locale });
      onClose();
    } catch (e) {
      fail(e);
    }
  };

  const sendFile = async (file: File) => {
    if (!FILE_TYPES.includes(file.type)) return setState({ status: "error", message: t("bookings.wrongType") });
    if (file.size > MAX_BYTES) return setState({ status: "error", message: t("bookings.tooBig") });
    setState({ status: "sending" });
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await start({ tripId, storageId, fileName: file.name || t("bookings.pickScreenshot"), language: locale });
      onClose();
    } catch (e) {
      fail(e);
    }
  };

  const sending = state.status === "sending";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal
        aria-labelledby="import-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl"
      >
        <h2 id="import-title" className="text-xl font-bold">
          {t("bookings.importTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("bookings.importIntro")}</p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            // A pasted screenshot is uploaded straight away.
            const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
            if (file) {
              e.preventDefault();
              void sendFile(file);
            }
          }}
          rows={6}
          maxLength={60000}
          placeholder={t("bookings.pastePlaceholderWeb")}
          className="mt-4 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => void sendText()}
          disabled={sending || text.trim().length < 20}
          className="mt-2 w-full rounded-full bg-primary py-2.5 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:opacity-90 disabled:opacity-50 active:scale-[0.98]"
        >
          {sending ? t("bookings.sending") : `✨ ${t("bookings.read")}`}
        </button>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) void sendFile(file);
          }}
          onClick={() => fileInput.current?.click()}
          className={cn(
            "mt-4 cursor-pointer rounded-2xl border-2 border-dashed border-border p-5 text-center text-sm text-muted-foreground transition-colors hover:border-primary",
            dragOver && "border-primary bg-primary/5 text-primary",
          )}
        >
          <span className="text-2xl">📎</span>
          <p className="mt-1 font-semibold text-foreground">{t("bookings.dropTitle")}</p>
          <p>{t("bookings.dropHint")}</p>
          <input
            ref={fileInput}
            type="file"
            accept={FILE_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void sendFile(file);
            }}
          />
        </div>

        {state.status === "error" && <p className="mt-3 text-sm text-danger">{state.message}</p>}
        {email.available && email.canManage && <ForwardingAddress tripId={tripId} address={email.address} />}
      </motion.div>
    </motion.div>
  );
}

function ForwardingAddress({ tripId, address }: { tripId: Id<"trips">; address?: string }) {
  const { t } = useI18n();
  const enable = useMutation(api.bookings.enableEmail);
  const disable = useMutation(api.bookings.disableEmail);
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-5 rounded-2xl bg-muted/60 p-4 text-sm">
      <p className="font-semibold">✉️ {t("bookings.forwardTitle")}</p>
      {address ? (
        <>
          <p className="mt-1 text-muted-foreground">{t("bookings.forwardIntro")}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2 py-1.5 text-xs">{address}</code>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              {copied ? t("bookings.copied") : t("bookings.copy")}
            </button>
          </div>
          <button onClick={() => void disable({ tripId })} className="mt-2 text-xs font-semibold text-muted-foreground hover:text-danger">
            {t("bookings.turnOff")}
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-muted-foreground">{t("bookings.forwardOff")}</p>
          <button onClick={() => void enable({ tripId })} className="mt-2 rounded-full bg-card px-3 py-1.5 text-xs font-semibold shadow-sm">
            {t("bookings.getAddress")}
          </button>
        </>
      )}
    </div>
  );
}
