"use client";

import { useI18n } from "@trip/i18n/react";
import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { cn } from "@trip/ui";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";
import { Avatar } from "./crew";

/** Who paid for what, and the fewest payments that settle everyone up. */
export function SplitCosts({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.expenses.forTrip, { tripId });
  const settle = useMutation(api.expenses.settle);
  const remove = useMutation(api.expenses.remove);
  const [adding, setAdding] = useState(false);
  const { t, f } = useI18n();
  if (!data) return null;
  const money = (cents: number) => f.money(cents / 100, data.currency);
  const mine = data.myBalanceCents;
  const meId = data.members.find((m) => m.isMe)?.userId;
  const nameOf = (id: string, name: string) => (id === meId ? t("split.you") : name === "Former member" ? t("split.formerMember") : name);

  return (
    <motion.section {...rise(0)} className="mt-16" aria-labelledby="split-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("split.eyebrow")}</p>
          <h2 id="split-title" className="mt-1 text-3xl font-extrabold tracking-tight">
            {t("split.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("split.intro")}</p>
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          aria-expanded={adding}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:opacity-90 active:scale-[0.97]"
        >
          {adding ? t("common.close") : `＋ ${t("split.addExpense")}`}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="overflow-hidden">
            <ExpenseForm tripId={tripId} members={data.members} currency={data.currency} onDone={() => setAdding(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1.3fr]">
        <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
          <div>
            <p className="text-sm text-muted-foreground">{t("split.groupSpending")}</p>
            <p className="text-3xl font-extrabold tabular-nums">{money(data.totalCents)}</p>
          </div>
          <div className={cn("rounded-2xl p-4", mine > 0 ? "bg-success/10" : mine < 0 ? "bg-danger/10" : "bg-muted")}>
            <p className="text-sm text-muted-foreground">{t("split.yourBalance")}</p>
            <p className={cn("text-xl font-bold tabular-nums", mine > 0 ? "text-success" : mine < 0 ? "text-danger" : "")}>
              {mine === 0 ? t("split.allSquare") : mine > 0 ? t("split.youreOwed", { amount: money(mine) }) : t("split.youOwe", { amount: money(-mine) })}
            </p>
          </div>
          {data.transfers.length > 0 && (
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {data.transfers.map((tr) => (
                  <motion.li key={`${tr.from}-${tr.to}`} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 font-medium">
                      {tr.from === meId
                        ? t("split.youPay", { to: nameOf(tr.to, tr.toName) })
                        : tr.to === meId
                          ? t("split.paysYou", { from: nameOf(tr.from, tr.fromName) })
                          : t("split.pays", { from: nameOf(tr.from, tr.fromName), to: nameOf(tr.to, tr.toName) })}
                    </span>
                    <span className="font-bold tabular-nums">{money(tr.amountCents)}</span>
                    {tr.involvesMe && (
                      <button
                        onClick={() => void settle({ tripId, from: tr.from, to: tr.to, amountCents: tr.amountCents })}
                        className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                      >
                        {t("split.markPaid")}
                      </button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-border/70 bg-card p-2 shadow-sm">
          {data.expenses.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">💸 {t("split.empty")}</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              <AnimatePresence initial={false}>
                {data.expenses.map((e) => (
                  <motion.li key={e._id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-muted/60">
                    <Avatar name={e.paidByName} userId={e.paidBy} size={32} ring={false} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{e.isSettlement ? `🤝 ${t("split.paidBack", { from: nameOf(e.paidBy, e.paidByName), to: nameOf(e.splitAmong[0] ?? "", e.splitNames[0] ?? "") })}` : e.description}</p>
                      {!e.isSettlement && (
                        <p className="truncate text-xs text-muted-foreground">
                          {e.splitAmong.length === data.members.length
                            ? t("split.paidSplitEveryone", { name: nameOf(e.paidBy, e.paidByName) })
                            : t("split.paidSplitWith", { name: nameOf(e.paidBy, e.paidByName), names: e.splitAmong.map((id, i) => nameOf(id, e.splitNames[i] ?? "")).join(", ") })}
                        </p>
                      )}
                    </div>
                    <span className={cn("font-bold tabular-nums", e.isSettlement && "text-muted-foreground")}>{money(e.amountCents)}</span>
                    {e.canDelete && (
                      <button onClick={() => void remove({ expenseId: e._id })} className="text-sm text-muted-foreground opacity-0 transition hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label={t("split.deleteExpense")}>
                        ✕
                      </button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </motion.section>
  );
}

type Member = { userId: string; name: string; isMe: boolean };

function ExpenseForm({ tripId, members, currency, onDone }: { tripId: Id<"trips">; members: Member[]; currency: string; onDone: () => void }) {
  const add = useMutation(api.expenses.add);
  const me = members.find((m) => m.isMe)?.userId ?? members[0]!.userId;
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(me);
  const [among, setAmong] = useState<string[]>(members.map((m) => m.userId));
  const [error, setError] = useState<string | null>(null);
  const { t, f } = useI18n();
  const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await add({ tripId, description, amountCents: cents, paidBy, splitAmong: among });
          onDone();
        } catch (err) {
          setError(err instanceof Error ? err.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : t("split.couldntAdd"));
        }
      }}
      className="mt-5 grid gap-4 rounded-3xl border border-border bg-card p-5 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t("split.whatWasIt")}
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("split.whatPlaceholder")} maxLength={80} className="rounded-xl border border-border bg-background px-3 py-2 font-normal outline-none focus:border-primary" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t("split.amount", { currency })}
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="rounded-xl border border-border bg-background px-3 py-2 font-normal tabular-nums outline-none focus:border-primary" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t("split.paidBy")}
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 font-normal">
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.isMe ? t("split.you") : m.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1 text-sm font-semibold">
        <legend>{t("split.splitBetween")}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {members.map((m) => {
            const on = among.includes(m.userId);
            return (
              <button
                type="button"
                key={m.userId}
                aria-pressed={on}
                onClick={() => setAmong((a) => (on ? a.filter((x) => x !== m.userId) : [...a, m.userId]))}
                className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition-colors", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
              >
                {m.isMe ? t("split.you") : m.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex items-center justify-between gap-3 sm:col-span-2">
        <p className="text-sm text-muted-foreground">
          {error ? <span className="text-danger">{error}</span> : cents > 0 && among.length > 0 ? t("split.each", { amount: f.money(cents / 100 / among.length, currency) }) : " "}
        </p>
        <button type="submit" disabled={!(cents > 0) || among.length === 0} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40 active:scale-[0.97]">
          {t("split.addExpense")}
        </button>
      </div>
    </form>
  );
}
