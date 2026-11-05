import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listMembers } from "./members";

export type NotificationKind = "idea" | "accepted" | "rejected" | "joined" | "expense" | "settled";

/**
 * Adds an in-app notification for each recipient and sends a push to their
 * phones. Recipients default to everyone on the trip except `actorId`.
 */
export async function notify(
  ctx: MutationCtx,
  trip: Doc<"trips">,
  { kind, text, actorId, to }: { kind: NotificationKind; text: string; actorId?: string; to?: string[] },
) {
  const everyone = to ?? (await listMembers(ctx, trip)).map((m) => m.userId);
  const recipients = [...new Set(everyone)].filter((id) => id !== actorId);
  if (recipients.length === 0) return;
  await Promise.all(recipients.map((userId) => ctx.db.insert("notifications", { userId, tripId: trip._id, kind, text, isRead: false })));

  const tokens = (
    await Promise.all(recipients.map((userId) => ctx.db.query("pushTokens").withIndex("by_userId", (q) => q.eq("userId", userId)).collect()))
  )
    .flat()
    .map((t) => t.token);
  if (tokens.length > 0) {
    await ctx.scheduler.runAfter(0, internal.push.send, { tokens, title: trip.title, body: text, data: { tripId: trip._id } });
  }
}
