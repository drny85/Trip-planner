"use client";

import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";

const AVATAR_COLORS = ["#0e7c66", "#6366f1", "#f97316", "#ec4899", "#0ea5e9", "#8b5cf6", "#16a34a", "#e11d48"];
const colorFor = (id: string) => AVATAR_COLORS[[...id].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_COLORS.length]!;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function Avatar({ name, userId, imageUrl, size = 36, ring = true }: { name: string; userId: string; imageUrl?: string; size?: number; ring?: boolean }) {
  return (
    <span
      title={name}
      className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white", ring && "ring-2 ring-card")}
      style={{ width: size, height: size, backgroundColor: colorFor(userId), fontSize: size * 0.38 }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny avatar from the sign-in provider
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(name) || "?"
      )}
    </span>
  );
}

/** Who's going: avatars, the invite link (owner) and member management. */
export function Crew({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.members.forTrip, { tripId });
  const createInvite = useMutation(api.members.createInvite);
  const revokeInvite = useMutation(api.members.revokeInvite);
  const removeMember = useMutation(api.members.remove);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!data) return null;

  const link = data.inviteToken && typeof window !== "undefined" ? `${window.location.origin}/join/${data.inviteToken}` : null;
  const copy = async (url: string) => {
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const count = data.members.length;

  return (
    <motion.section {...rise(2)} className="mt-6 rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-6" aria-labelledby="crew-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-2">
            {data.members.slice(0, 6).map((m, i) => (
              <motion.span key={m.userId} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05, duration: 0.25, ease: EASE_OUT }}>
                <Avatar {...m} />
              </motion.span>
            ))}
            {count > 6 && <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-bold ring-2 ring-card">+{count - 6}</span>}
          </div>
          <div>
            <h2 id="crew-title" className="font-bold">
              {count === 1 ? "Just you so far" : `${count} going`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {data.isOwner ? "Invite friends to suggest ideas and vote on them." : "Suggest ideas below. The group votes, and the majority decides."}
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:opacity-90 active:scale-[0.97]"
        >
          {data.isOwner ? "＋ Invite friends" : "See who's going"}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="mt-5 grid gap-5 border-t border-border pt-5 md:grid-cols-2">
              {data.isOwner && (
                <div>
                  <p className="text-sm font-semibold">Invite link</p>
                  <p className="mt-1 text-sm text-muted-foreground">Anyone with it can join this trip after signing in.</p>
                  {link ? (
                    <>
                      <div className="mt-3 flex gap-2">
                        <input readOnly value={link} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-xl border border-border bg-muted px-3 py-2 text-xs" />
                        <button onClick={() => void copy(link)} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground active:scale-[0.97]">
                          {copied ? "Copied ✓" : "Copy"}
                        </button>
                      </div>
                      <button onClick={() => void revokeInvite({ tripId })} className="mt-2 text-sm font-semibold text-danger hover:underline">
                        Turn off the link
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={async () => {
                        const token = await createInvite({ tripId });
                        await copy(`${window.location.origin}/join/${token}`);
                      }}
                      className="mt-3 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
                    >
                      Create link and copy
                    </button>
                  )}
                </div>
              )}
              <ul className={cn("flex flex-col gap-2", !data.isOwner && "md:col-span-2 md:max-w-md")}>
                {data.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3">
                    <Avatar {...m} size={32} ring={false} />
                    <span className="flex-1 truncate font-medium">
                      {m.name}
                      {m.isMe && <span className="text-muted-foreground"> (you)</span>}
                    </span>
                    {m.role === "owner" ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Organizer</span>
                    ) : (
                      data.isOwner && (
                        <button
                          onClick={() => confirm(`Remove ${m.name} from the trip?`) && void removeMember({ tripId, userId: m.userId })}
                          className="text-xs font-semibold text-muted-foreground hover:text-danger"
                        >
                          Remove
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

export function LeaveTrip({ tripId, title }: { tripId: Id<"trips">; title: string }) {
  const leave = useMutation(api.members.leave);
  const router = useRouter();
  return (
    <div className="mt-14 flex justify-center">
      <button
        onClick={async () => {
          if (!confirm(`Leave "${title}"? You'll need a new invite to rejoin.`)) return;
          router.push("/trips");
          await leave({ tripId });
        }}
        className="rounded-full bg-muted px-5 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-danger/10 hover:text-danger active:scale-[0.97]"
      >
        Leave trip
      </button>
    </div>
  );
}
