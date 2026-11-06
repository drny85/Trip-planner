"use client";

import { useI18n } from "@trip/i18n/react";
import { api } from "@trip/backend/api";
import type { Id } from "@trip/backend/dataModel";
import { parseAmount, SPLIT_MODES, type SplitMode } from "@trip/backend/settle";
import { amountText, draftFrom, errorCode, percentLabel, prefill, readDraft, type Draft } from "@trip/backend/splitDraft";
import { cn, currencyChoices, currencyFromLocales, CURRENCIES } from "@trip/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE_OUT, rise } from "@/lib/motion";
import { Avatar } from "./crew";

type Data = NonNullable<FunctionReturnType<typeof api.expenses.forTrip>>;
type Entry = Data["entries"][number];
type ExpenseEntry = Extract<Entry, { kind: "expense" }>;
type T = ReturnType<typeof useI18n>["t"];

/** Translates a failed expense mutation into a message for the user. */
function errorMessage(t: T, e: unknown) {
  const code = errorCode(e);
  const key = `split.errors.${code}` as Parameters<T>[0];
  const text = code ? t(key) : null;
  return text && text !== key ? text : t("split.couldntAdd");
}

/** Shared helpers for the section: names, money and labels from one place. */
function useSplitText(data: Data) {
  const { t, f } = useI18n();
  /** Group-currency cents, or cents of another currency when one is given. */
  const money = (cents: number, currency = data.currency) => f.money(cents / 100, currency);
  const byId = new Map(data.people.map((p) => [p.userId, p]));
  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p?.isMe ? t("split.you") : (p?.name ?? t("split.formerMember"));
  };
  const firstName = (id: string) => (byId.get(id)?.isMe ? t("split.you") : nameOf(id).split(" ")[0]!);
  return { t, money, nameOf, firstName, byId };
}

/**
 * Shared costs on a trip: what the group spent, where each person stands, the
 * payments that settle everyone up, and every expense and payment so far.
 */
export function SplitCosts({ tripId }: { tripId: Id<"trips"> }) {
  const data = useQuery(api.expenses.forTrip, { tripId });
  const [form, setForm] = useState<null | { expense?: ExpenseEntry }>(null);
  const { t } = useI18n();
  if (!data) return null;

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
          onClick={() => setForm((f) => (f ? null : {}))}
          aria-expanded={form != null}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:opacity-90 active:scale-[0.97]"
        >
          {form ? t("common.close") : `＋ ${t("split.addExpense")}`}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {form && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="overflow-hidden">
            <ExpenseForm key={form.expense?._id ?? "new"} tripId={tripId} data={data} expense={form.expense} onDone={() => setForm(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1.3fr]">
        <Balances tripId={tripId} data={data} />
        <Entries data={data} onEdit={(expense) => setForm({ expense })} />
      </div>
    </motion.section>
  );
}

/** Group total, your balance, each person's paid vs. share, and the suggested payments. */
function Balances({ tripId, data }: { tripId: Id<"trips">; data: Data }) {
  const { t, money, nameOf } = useSplitText(data);
  const mine = data.myBalanceCents;
  const people = data.people.filter((p) => p.isMember || p.netCents !== 0);

  return (
    <div className="flex flex-col gap-5 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{t("split.groupSpending")}</p>
          <p className="text-3xl font-extrabold tabular-nums">{money(data.totalCents)}</p>
          <GroupCurrency tripId={tripId} data={data} />
        </div>
        <div className={cn("rounded-2xl px-4 py-3", mine > 0 ? "bg-success/10" : mine < 0 ? "bg-danger/10" : "bg-muted")}>
          <p className="text-xs text-muted-foreground">{t("split.yourBalance")}</p>
          <p className={cn("text-lg font-bold tabular-nums", mine > 0 ? "text-success" : mine < 0 ? "text-danger" : "")}>
            {mine === 0 ? t("split.allSquare") : mine > 0 ? t("split.youreOwed", { amount: money(mine) }) : t("split.youOwe", { amount: money(-mine) })}
          </p>
        </div>
      </div>

      {data.totalCents > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">{t("split.whoPaid")}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {people.map((p) => (
              <li key={p.userId} className="flex items-center gap-3">
                <Avatar name={nameOf(p.userId)} userId={p.userId} imageUrl={p.imageUrl ?? undefined} size={28} ring={false} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{nameOf(p.userId)}</p>
                  <p className="truncate text-xs text-muted-foreground tabular-nums">{t("split.paidAndShare", { paid: money(p.paidCents), share: money(p.shareCents) })}</p>
                </div>
                <span className={cn("text-sm font-bold tabular-nums", p.netCents > 0 ? "text-success" : p.netCents < 0 ? "text-danger" : "text-muted-foreground")}>
                  {p.netCents === 0 ? t("split.settled") : p.netCents > 0 ? t("split.getsBack", { amount: money(p.netCents) }) : t("split.owes", { amount: money(-p.netCents) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.transfers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">{t("split.suggested")}</h3>
          <p className="text-xs text-muted-foreground">{t("split.suggestedHint")}</p>
          <ul className="mt-2 flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {data.transfers.map((tr) => (
                <TransferRow key={`${tr.from}-${tr.to}`} tripId={tripId} data={data} transfer={tr} />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </div>
  );
}

/** "Balances in USD · Change": the organizer can move the whole ledger to another currency. */
function GroupCurrency({ tripId, data }: { tripId: Id<"trips">; data: Data }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {t("split.balancesIn", { currency: data.currency })}
      {data.canChangeCurrency && !open && (
        <button onClick={() => setOpen(true)} className="ml-2 font-semibold text-primary hover:underline">
          {t("split.changeCurrency")}
        </button>
      )}
      {open && <GroupCurrencyForm tripId={tripId} data={data} onDone={() => setOpen(false)} />}
    </div>
  );
}

function GroupCurrencyForm({ tripId, data, onDone }: { tripId: Id<"trips">; data: Data; onDone: () => void }) {
  const change = useMutation(api.expenses.setGroupCurrency);
  const { t } = useI18n();
  const [next, setNext] = useState(data.homeCurrency && data.homeCurrency !== data.currency ? data.homeCurrency : (data.localCurrency ?? data.currency));
  const rate = useRate(data.currency, next);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-muted/50 p-3 text-sm text-foreground">
      <CurrencyPicker value={next} onChange={setNext} home={data.homeCurrency} local={data.localCurrency} group={data.currency} />
      <RateField from={data.currency} to={next} rate={rate} />
      {!rate.same && rate.rate != null && <p className="text-xs text-muted-foreground">{t("split.switchCurrencyHint", { from: data.currency, rate: rate.text, to: next })}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
          {t("common.cancel")}
        </button>
        <button
          disabled={rate.same || rate.rate == null}
          onClick={async () => {
            setError(null);
            try {
              await change({ tripId, currency: next, rate: rate.rate! });
              onDone();
            } catch (err) {
              setError(errorMessage(t, err));
            }
          }}
          className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {t("split.switchCurrency", { currency: next })}
        </button>
      </div>
    </div>
  );
}

/** One suggested payment. "Mark paid" opens an amount (prefilled with the full sum) to confirm. */
function TransferRow({ tripId, data, transfer: tr }: { tripId: Id<"trips">; data: Data; transfer: Data["transfers"][number] }) {
  const record = useMutation(api.expenses.recordPayment);
  const { t, money, nameOf } = useSplitText(data);
  const [amount, setAmount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cents = amount == null ? null : parseAmount(amount);
  const me = data.me;
  const label = tr.from === me ? t("split.youPay", { to: nameOf(tr.to) }) : tr.to === me ? t("split.paysYou", { from: nameOf(tr.from) }) : t("split.pays", { from: nameOf(tr.from), to: nameOf(tr.to) });

  return (
    <motion.li layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} className="rounded-2xl bg-muted/50 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-medium">{label}</span>
        <span className="font-bold tabular-nums">{money(tr.amountCents)}</span>
        {tr.canRecord && amount == null && (
          <button onClick={() => setAmount(amountText(tr.amountCents))} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20">
            {t("split.markPaid")}
          </button>
        )}
      </div>
      {amount != null && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (cents == null) return;
            setError(null);
            try {
              await record({ tripId, from: tr.from, to: tr.to, amountCents: cents });
              setAmount(null);
            } catch (err) {
              setError(errorMessage(t, err));
            }
          }}
        >
          <input
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            aria-label={t("split.amount", { currency: data.currency })}
            className="w-28 rounded-xl border border-border bg-background px-3 py-1.5 tabular-nums outline-none focus:border-primary"
          />
          <span className="flex-1 text-xs text-muted-foreground">{error ? <span className="text-danger">{error}</span> : t("split.upTo", { amount: money(tr.amountCents) })}</span>
          <button type="button" onClick={() => setAmount(null)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={cents == null || cents <= 0 || cents > tr.amountCents} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
            {t("split.confirm")}
          </button>
        </form>
      )}
    </motion.li>
  );
}

/** Every expense and payment, newest first. Click an expense to see who owes what for it. */
function Entries({ data, onEdit }: { data: Data; onEdit: (e: ExpenseEntry) => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-2 shadow-sm">
      {data.entries.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">💸 {t("split.empty")}</p>
      ) : (
        <ul className="max-h-[32rem] overflow-y-auto">
          <AnimatePresence initial={false}>
            {data.entries.map((e) => (
              <motion.li key={e._id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}>
                {e.kind === "expense" ? <ExpenseRow data={data} expense={e} onEdit={() => onEdit(e)} /> : <PaymentRow data={data} payment={e} />}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

/** "Ana paid · split equally with everyone", or "split by shares" and so on. */
export function splitLine(t: T, data: Data, e: ExpenseEntry, nameOf: (id: string) => string, firstName: (id: string) => string) {
  const name = nameOf(e.paidBy);
  if (e.mode !== "equal") return t("split.paidSplitBy", { name, how: t(`split.splitSummary.${e.mode}`) });
  const members = data.people.filter((p) => p.isMember);
  return e.shares.length === members.length && members.every((m) => e.shares.some((s) => s.userId === m.userId))
    ? t("split.paidSplitEveryone", { name })
    : t("split.paidSplitWith", { name, names: e.shares.map((s) => firstName(s.userId)).join(", ") });
}

function ExpenseRow({ data, expense: e, onEdit }: { data: Data; expense: ExpenseEntry; onEdit: () => void }) {
  const remove = useMutation(api.expenses.remove);
  const { t, money, nameOf, firstName, byId } = useSplitText(data);
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-2xl px-3 py-2.5 transition-colors", open ? "bg-muted/60" : "hover:bg-muted/60")}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <Avatar name={nameOf(e.paidBy)} userId={e.paidBy} imageUrl={byId.get(e.paidBy)?.imageUrl ?? undefined} size={32} ring={false} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{e.description}</p>
          <p className="truncate text-xs text-muted-foreground">{splitLine(t, data, e, nameOf, firstName)}</p>
        </div>
        <div className="text-right">
          <p className="font-bold tabular-nums">{money(e.amountCents, e.currency)}</p>
          {e.currency !== data.currency && <p className="text-xs text-muted-foreground tabular-nums">{t("split.converted", { amount: money(e.groupCents) })}</p>}
          {e.myShareCents > 0 && <p className="text-xs text-muted-foreground tabular-nums">{t("split.yourShare", { amount: money(e.myShareCents) })}</p>}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <ul className="mt-2 flex flex-col gap-1 pl-11 text-sm">
              {e.shares.map((s) => (
                <li key={s.userId} className="flex justify-between gap-2">
                  <span className="truncate">
                    {nameOf(s.userId)}
                    {e.mode === "shares" && s.value != null && <span className="text-muted-foreground"> · {t("split.sharesCount", { count: s.value })}</span>}
                    {e.mode === "percent" && s.value != null && <span className="text-muted-foreground"> · {percentLabel(s.value)}%</span>}
                  </span>
                  <span className="tabular-nums">{money(s.cents)}</span>
                </li>
              ))}
            </ul>
            {e.canEdit && (
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={onEdit} className="rounded-full px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10">
                  {t("split.edit")}
                </button>
                <button onClick={() => void remove({ expenseId: e._id })} className="rounded-full px-3 py-1 text-xs font-semibold text-danger hover:bg-danger/10">
                  {t("split.deleteExpense")}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PaymentRow({ data, payment: p }: { data: Data; payment: Extract<Entry, { kind: "payment" }> }) {
  const undo = useMutation(api.expenses.removePayment);
  const { t, money, nameOf } = useSplitText(data);
  return (
    <div className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-muted/60">
      <span className="grid size-8 place-items-center rounded-full bg-success/15 text-base">🤝</span>
      <p className="min-w-0 flex-1 truncate font-semibold">{t("split.paidBack", { from: nameOf(p.from), to: nameOf(p.to) })}</p>
      <span className="font-bold tabular-nums text-muted-foreground">{money(p.amountCents)}</span>
      {p.canEdit && (
        <button onClick={() => void undo({ paymentId: p._id })} className="text-xs font-semibold text-muted-foreground opacity-0 transition hover:text-danger group-hover:opacity-100 focus:opacity-100">
          {t("split.undoPayment")}
        </button>
      )}
    </div>
  );
}

const rateText = (r: number) => String(Number(r.toPrecision(6)));
const readRate = (text: string) => {
  const n = Number(text.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The exchange rate from `from` into `to`, as editable text: today's rate is fetched
 * whenever the pair changes, unless `initial` already has one for it.
 */
function useRate(from: string, to: string, initial?: { currency: string; rate: number }) {
  const fetchRate = useAction(api.fx.rate);
  const pair = `${from}>${to}`;
  const known = initial && initial.currency === from;
  const [state, setState] = useState<{ pair: string; text: string; status: "ok" | "missing"; date?: string }>(() => ({
    pair: known ? pair : "",
    text: known ? rateText(initial.rate) : "",
    status: "ok",
  }));
  useEffect(() => {
    if (from === to || state.pair === pair) return;
    let live = true;
    fetchRate({ from, to })
      .then((r) => live && setState({ pair, text: r ? rateText(r.rate) : "", status: r ? "ok" : "missing", date: r?.date }))
      .catch(() => live && setState({ pair, text: "", status: "missing" }));
    return () => {
      live = false;
    };
    // Only refetch when the currency pair changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair]);
  const same = from === to;
  const loading = !same && state.pair !== pair;
  return {
    same,
    text: same ? "1" : loading ? "" : state.text,
    setText: (text: string) => setState({ pair, text, status: "ok" }),
    status: same ? ("ok" as const) : loading ? ("loading" as const) : state.status,
    date: loading ? undefined : state.date,
    rate: same ? 1 : loading ? null : readRate(state.text),
  };
}

/** Home currency first, the trip's local one second, then any other. */
function CurrencyPicker({ value, onChange, home, local, group }: { value: string; onChange: (c: string) => void; home: string | null; local: string | null; group: string }) {
  const { t, f } = useI18n();
  const choices = currencyChoices(home, local, group);
  const tag = (c: string) => (c === home ? t("split.homeTag") : c === local ? t("split.localTag") : null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {choices.map((c) => (
        <button type="button" key={c} role="radio" aria-checked={value === c} onClick={() => onChange(c)} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition-colors", value === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
          {f.currencySymbol(c) !== c ? `${f.currencySymbol(c)} ` : ""}
          {c}
          {tag(c) && <span className="ml-1 font-normal opacity-75">· {tag(c)}</span>}
        </button>
      ))}
      <select
        aria-label={t("split.otherCurrency")}
        value={choices.includes(value) ? "" : value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className={cn("rounded-full border border-border bg-background px-3 py-1.5 text-sm", !choices.includes(value) && "border-primary font-semibold")}
      >
        <option value="">{t("split.otherCurrency")}</option>
        {CURRENCIES.filter((c) => !choices.includes(c)).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

/** "1 JPY in USD: [0.0065]" with where the number came from. */
function RateField({ from, to, rate }: { from: string; to: string; rate: ReturnType<typeof useRate> }) {
  const { t } = useI18n();
  if (rate.same) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold">{t("split.rateLabel", { from, to })}</span>
      <input value={rate.text} onChange={(e) => rate.setText(e.target.value)} inputMode="decimal" className="w-28 rounded-xl border border-border bg-background px-3 py-1.5 tabular-nums outline-none focus:border-primary" />
      <span className={cn("text-xs", rate.status === "missing" ? "text-danger" : "text-muted-foreground")}>
        {rate.status === "loading" ? t("split.rateLoading") : rate.status === "missing" ? t("split.rateMissing") : rate.date ? t("split.rateHint", { date: rate.date }) : ""}
      </span>
    </label>
  );
}

/** Add or edit an expense: what, how much, who paid, and how it's split. */
function ExpenseForm({ tripId, data, expense, onDone }: { tripId: Id<"trips">; data: Data; expense?: ExpenseEntry; onDone: () => void }) {
  const add = useMutation(api.expenses.add);
  const update = useMutation(api.expenses.update);
  const { t, money, firstName } = useSplitText(data);
  const members = data.people.filter((p) => p.isMember);
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? amountText(expense.amountCents) : "");
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? data.me);
  const home = data.homeCurrency ?? (typeof navigator === "undefined" ? null : currencyFromLocales(navigator.languages ?? []));
  const [currency, setCurrency] = useState(expense?.currency ?? home ?? data.localCurrency ?? data.currency);
  const rate = useRate(currency, data.currency, expense);
  const [draft, setDraft] = useState<Draft>(expense ? draftFrom(expense) : { mode: "equal", people: members.map((m) => m.userId), inputs: {} });
  const [error, setError] = useState<string | null>(null);
  const cents = parseAmount(amount);
  const reading = readDraft(cents, draft);
  // People who left the trip can't be picked for new splits, but stay visible on old ones.
  const pickable = [...members.map((m) => m.userId), ...draft.people.filter((id) => !members.some((m) => m.userId === id))];

  const setMode = (mode: SplitMode) => setDraft((d) => ({ ...d, mode, inputs: prefill(mode, d.people, cents) }));
  const toggle = (id: string) =>
    setDraft((d) => {
      const on = d.people.includes(id);
      const people = on ? d.people.filter((x) => x !== id) : pickable.filter((x) => x === id || d.people.includes(x));
      return { ...d, people, inputs: d.mode === "shares" && !on ? { ...d.inputs, [id]: "1" } : d.inputs };
    });

  const status = (() => {
    if (error) return <span className="text-danger">{error}</span>;
    if (cents == null || draft.people.length === 0) return " ";
    if (draft.mode === "exact" && reading.remaining) return <span className={reading.remaining < 0 ? "text-danger" : ""}>{reading.remaining > 0 ? t("split.left", { amount: money(reading.remaining, currency) }) : t("split.over", { amount: money(-reading.remaining, currency) })}</span>;
    if (draft.mode === "percent" && reading.remaining) return <span className={reading.remaining < 0 ? "text-danger" : ""}>{reading.remaining > 0 ? t("split.percentLeft", { percent: percentLabel(reading.remaining) }) : t("split.percentOver", { percent: percentLabel(-reading.remaining) })}</span>;
    if (draft.mode === "equal") return t("split.each", { amount: money(Math.max(...Object.values(reading.preview)), currency) });
    return reading.error ? t(`split.errors.${reading.error}`) : " ";
  })();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!reading.split || cents == null) return;
        setError(null);
        if (rate.rate == null) return setError(t("split.errors.needRate"));
        const fields = { description, amountCents: cents, paidBy, split: reading.split, currency, rate: rate.rate };
        try {
          if (expense) await update({ expenseId: expense._id, ...fields });
          else await add({ tripId, ...fields });
          onDone();
        } catch (err) {
          setError(errorMessage(t, err));
        }
      }}
      className="mt-5 grid gap-4 rounded-3xl border border-border bg-card p-5 sm:grid-cols-2"
    >
      {expense && <p className="text-sm font-bold sm:col-span-2">{t("split.editExpense")}</p>}
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
      <fieldset role="radiogroup" className="flex flex-col gap-2 text-sm sm:col-span-2">
        <legend className="font-semibold">{t("split.currency")}</legend>
        <CurrencyPicker value={currency} onChange={setCurrency} home={home} local={data.localCurrency} group={data.currency} />
        <RateField from={currency} to={data.currency} rate={rate} />
      </fieldset>
      <fieldset className="flex flex-col gap-1 text-sm font-semibold">
        <legend>{t("split.splitBetween")}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {pickable.map((id) => {
            const on = draft.people.includes(id);
            return (
              <button type="button" key={id} aria-pressed={on} onClick={() => toggle(id)} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition-colors", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {firstName(id)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 text-sm sm:col-span-2">
        <legend className="font-semibold">{t("split.splitHow")}</legend>
        <div role="radiogroup" className="mt-1 inline-flex w-fit flex-wrap gap-1 rounded-full bg-muted p-1">
          {SPLIT_MODES.map((m) => (
            <button type="button" role="radio" aria-checked={draft.mode === m} key={m} onClick={() => setMode(m)} className={cn("rounded-full px-3 py-1 text-sm font-semibold transition-colors", draft.mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {t(`split.modes.${m}`)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t(`split.modeHints.${draft.mode}`)}</p>
        {draft.people.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {draft.people.map((id) => (
              <li key={id} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate font-medium">{firstName(id)}</span>
                {draft.mode !== "equal" && (
                  <span className="flex items-center gap-1">
                    <input
                      value={draft.inputs[id] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, inputs: { ...d.inputs, [id]: e.target.value } }))}
                      inputMode={draft.mode === "shares" ? "numeric" : "decimal"}
                      aria-label={`${firstName(id)} · ${t(`split.modes.${draft.mode}`)}`}
                      className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-right tabular-nums outline-none focus:border-primary"
                    />
                    {draft.mode === "percent" && <span className="text-muted-foreground">%</span>}
                  </span>
                )}
                <span className="w-24 text-right tabular-nums text-muted-foreground">{reading.preview[id] != null ? money(reading.preview[id]!, currency) : "–"}</span>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="flex items-center justify-between gap-3 sm:col-span-2">
        <p className="text-sm text-muted-foreground">
          {status}
          {!rate.same && cents != null && rate.rate != null && <span className="ml-2">{t("split.converted", { amount: money(Math.round(cents * rate.rate)) })}</span>}
        </p>
        <button type="submit" disabled={!reading.split || rate.rate == null} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40 active:scale-[0.97]">
          {expense ? t("split.saveChanges") : t("split.addExpense")}
        </button>
      </div>
    </form>
  );
}
