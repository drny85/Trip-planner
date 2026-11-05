/**
 * Splitting costs. Amounts are whole cents so the shares always add up exactly:
 * the leftover cents of an uneven split go to the first people in the list.
 */
export type Split = { paidBy: string; amountCents: number; splitAmong: string[] };
export type Transfer = { from: string; to: string; amountCents: number };

/** Each person's share of one expense, in cents. */
export function shares(amountCents: number, people: string[]) {
  const base = Math.floor(amountCents / people.length);
  const extra = amountCents - base * people.length;
  return people.map((p, i) => [p, base + (i < extra ? 1 : 0)] as const);
}

/** Net balance per person: positive means they're owed money, negative means they owe. */
export function balances(expenses: Split[]) {
  const net = new Map<string, number>();
  const add = (who: string, cents: number) => net.set(who, (net.get(who) ?? 0) + cents);
  for (const e of expenses) {
    if (e.splitAmong.length === 0 || e.amountCents <= 0) continue;
    add(e.paidBy, e.amountCents);
    for (const [who, cents] of shares(e.amountCents, e.splitAmong)) add(who, -cents);
  }
  return net;
}

/** The fewest simple payments that settle everyone up (largest debtor pays largest creditor). */
export function settleUp(net: Map<string, number>): Transfer[] {
  const owed = [...net].filter(([, c]) => c > 0).map(([who, c]) => ({ who, c })).sort((a, b) => b.c - a.c);
  const owes = [...net].filter(([, c]) => c < 0).map(([who, c]) => ({ who, c: -c })).sort((a, b) => b.c - a.c);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < owes.length && j < owed.length) {
    const pay = Math.min(owes[i]!.c, owed[j]!.c);
    if (pay > 0) out.push({ from: owes[i]!.who, to: owed[j]!.who, amountCents: pay });
    owes[i]!.c -= pay;
    owed[j]!.c -= pay;
    if (owes[i]!.c === 0) i++;
    if (owed[j]!.c === 0) j++;
  }
  return out;
}
