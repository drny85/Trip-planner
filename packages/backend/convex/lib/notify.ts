import { createFormat, defaultLocale, formatTagFor, isLocale, notificationText, translator, type Locale, type NotificationKind, type NotificationParams } from "@trip/i18n";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { listMembers } from "./members";

export type { NotificationKind };

/** The language a user picked in the apps, or English. */
export async function languageOf(ctx: QueryCtx, userId: string): Promise<Locale> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
    .unique();
  return isLocale(user?.language) ? user.language : defaultLocale;
}

/** A notification's text in one language. */
export function renderNotification(locale: Locale, kind: NotificationKind, params: NotificationParams) {
  return notificationText(translator(locale), createFormat(locale, formatTagFor(locale)), kind, params);
}

/**
 * Adds an in-app notification for each recipient and sends a push to their
 * phones, each in the recipient's own language. Recipients default to everyone
 * on the trip except `actorId`. The apps re-render `params` in the reader's
 * current language; `text` is kept for older app versions.
 */
export async function notify(
  ctx: MutationCtx,
  trip: Doc<"trips">,
  { kind, params, actorId, to }: { kind: NotificationKind; params: NotificationParams; actorId?: string; to?: string[] },
) {
  const everyone = to ?? (await listMembers(ctx, trip)).map((m) => m.userId);
  const recipients = [...new Set(everyone)].filter((id) => id !== actorId);
  if (recipients.length === 0) return;

  const byLanguage = new Map<Locale, string[]>();
  for (const userId of recipients) {
    const locale = await languageOf(ctx, userId);
    byLanguage.set(locale, [...(byLanguage.get(locale) ?? []), userId]);
  }

  for (const [locale, userIds] of byLanguage) {
    const text = renderNotification(locale, kind, params);
    await Promise.all(userIds.map((userId) => ctx.db.insert("notifications", { userId, tripId: trip._id, kind, text, params, isRead: false })));
    const tokens = (
      await Promise.all(userIds.map((userId) => ctx.db.query("pushTokens").withIndex("by_userId", (q) => q.eq("userId", userId)).collect()))
    )
      .flat()
      .map((t) => t.token);
    if (tokens.length > 0) {
      await ctx.scheduler.runAfter(0, internal.push.send, { tokens, title: trip.title, body: text, data: { tripId: trip._id } });
    }
  }
}
