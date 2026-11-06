import type { Format } from "./format";
import type { Vars } from "./translate";

export type NotificationKind = "idea" | "accepted" | "rejected" | "joined" | "expense" | "settled" | "groupPlan";

/**
 * What a notification says, stored as data so each reader sees it in their own
 * language. `amountCents` + `currency` become `{amount}` when it's rendered.
 */
export type NotificationParams = { name?: string; title?: string; item?: string; count?: number; amountCents?: number; currency?: string };

type T = (key: `notifications.${NotificationKind}`, vars?: Vars) => string;

export function notificationText(t: T, money: Format["money"], kind: NotificationKind, params: NotificationParams) {
  const { amountCents, currency, ...rest } = params;
  const vars: Vars = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Vars;
  if (amountCents !== undefined) vars.amount = money(amountCents / 100, currency ?? "USD");
  return t(`notifications.${kind}`, vars);
}
