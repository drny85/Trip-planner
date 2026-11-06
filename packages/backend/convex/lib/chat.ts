/** Rules for the trip chat, kept free of Convex so the apps and tests can share them. */

/** Longest message we accept, in characters. */
export const MAX_MESSAGE_LENGTH = 2000;

/** How many messages the chat loads at first, and how many more each "earlier" tap adds. */
export const PAGE_SIZE = 60;

/** The most a page may ask for, so one query never reads the whole history of a huge chat. */
export const MAX_PAGE = 600;

/**
 * After a chat push, more messages stay quiet for this long unless the person
 * reads the chat in between. A lively chat buzzes once, not on every line.
 */
export const PUSH_QUIET_MS = 5 * 60_000;

/** Trims a message and squeezes runs of blank lines. Returns "" when nothing is left. */
export function cleanMessage(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Whether a new chat message should push to this person's phone. */
export function shouldPush({ muted, lastReadAt, lastPushAt, now }: { muted?: boolean; lastReadAt: number; lastPushAt?: number; now: number }) {
  if (muted) return false;
  if (lastPushAt === undefined) return true;
  // They opened the chat since the last push, so this is news again.
  if (lastPushAt <= lastReadAt) return true;
  return now - lastPushAt >= PUSH_QUIET_MS;
}

/** The push text: "Ana: see you at 8!", cut to fit a lock screen. */
export function pushBody(name: string, text: string, max = 140) {
  const first = name.trim().split(/\s+/)[0] || name;
  const line = `${first}: ${text.replace(/\s+/g, " ").trim()}`;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Badge text for an unread count. */
export function badgeLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A timestamp's date on this device, as "YYYY-MM-DD". */
export function localDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A timestamp's time on this device, as "HH:MM" (the apps format it per language). */
export function localTime(ms: number) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "today", "yesterday", or the date itself, relative to `now`. */
export function dayLabel(date: string, now = Date.now()): "today" | "yesterday" | string {
  if (date === localDate(now)) return "today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return date === localDate(y.getTime()) ? "yesterday" : date;
}

type ChatMessageLike = { _id: string; _creationTime: number; authorId: string; isMine: boolean };

/** Two messages from one person this close together share a bubble group. */
const GROUP_GAP_MS = 5 * 60_000;

export type ChatRow<M extends ChatMessageLike> =
  | { kind: "day"; key: string; date: string }
  | { kind: "new"; key: string }
  | { kind: "message"; key: string; message: M; /** First in a run from the same person: show their name. */ first: boolean; /** Last in the run: show the time. */ last: boolean };

/**
 * Lays a chat out for display: a date line when the day changes, a "New
 * messages" line before the first unread message from someone else, and runs
 * of messages from one person grouped together.
 */
export function chatRows<M extends ChatMessageLike>(messages: M[], readUpTo: number): ChatRow<M>[] {
  const rows: ChatRow<M>[] = [];
  let lastDate = "";
  let markedNew = false;
  messages.forEach((m, i) => {
    const date = localDate(m._creationTime);
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const newDay = date !== lastDate;
    if (newDay) {
      rows.push({ kind: "day", key: `day-${date}`, date });
      lastDate = date;
    }
    const isNew = !markedNew && readUpTo > 0 && !m.isMine && m._creationTime > readUpTo;
    if (isNew) {
      rows.push({ kind: "new", key: "new" });
      markedNew = true;
    }
    const joinsPrev = !newDay && !isNew && prev?.authorId === m.authorId && m._creationTime - prev._creationTime < GROUP_GAP_MS;
    const joinsNext =
      next !== undefined &&
      next.authorId === m.authorId &&
      localDate(next._creationTime) === date &&
      next._creationTime - m._creationTime < GROUP_GAP_MS &&
      !(!markedNew && readUpTo > 0 && !next.isMine && next._creationTime > readUpTo);
    rows.push({ kind: "message", key: m._id, message: m, first: !joinsPrev, last: !joinsNext });
  });
  return rows;
}
