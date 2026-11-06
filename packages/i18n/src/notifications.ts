import type { Format } from "./format";
import type { Vars } from "./translate";

export type NotificationKind =
  | "idea"
  | "accepted"
  | "rejected"
  | "joined"
  | "expense"
  | "settled"
  | "groupPlan"
  | "priceDrop"
  | "flightDelay"
  | "flightGate"
  | "flightCanceled"
  | "fareDrop"
  | "fareTarget";

/**
 * What a notification says, stored as data so each reader sees it in their own
 * language. `amountCents` + `currency` become `{amount}` and `wasCents` becomes
 * `{was}` when it's rendered; `time` ("14:35") becomes `{time}` on the reader's clock.
 */
export type NotificationParams = {
  name?: string;
  title?: string;
  item?: string;
  count?: number;
  amountCents?: number;
  wasCents?: number;
  currency?: string;
  time?: string;
};

type T = (key: `notifications.${NotificationKind}`, vars?: Vars) => string;

/** `f` is the reader's Format (or just its `money`, as older callers pass). */
export function notificationText(t: T, f: Format["money"] | Pick<Format, "money" | "time">, kind: NotificationKind, params: NotificationParams) {
  const { amountCents, wasCents, currency, time, ...rest } = params;
  const money = typeof f === "function" ? f : f.money;
  const vars: Vars = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Vars;
  if (amountCents !== undefined) vars.amount = money(amountCents / 100, currency ?? "USD");
  if (wasCents !== undefined) vars.was = money(wasCents / 100, currency ?? "USD");
  if (time !== undefined) vars.time = typeof f === "function" ? time : f.time(time);
  return t(`notifications.${kind}`, vars);
}
