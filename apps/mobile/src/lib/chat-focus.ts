/**
 * Hands a "show me this" request from the chat to the trip screen under it: the
 * chat screen saves where to go and goes back, and the trip screen scrolls there
 * when it comes into focus.
 */
export type FocusTarget = { subTripId: string; activityId?: string } | { ideas: true };
export type ChatFocus = { tripId: string; target: FocusTarget };

let pending: ChatFocus | null = null;

export function requestTripFocus(focus: ChatFocus) {
  pending = focus;
}

/** The waiting request for this trip, if any; reading it clears it. */
export function takeTripFocus(tripId: string) {
  if (pending?.tripId !== tripId) return null;
  const focus = pending;
  pending = null;
  return focus.target;
}

/** The trip whose chat is on screen, so its pushes don't pop up over it. */
let visibleChat: string | null = null;
export const setVisibleChat = (tripId: string | null) => {
  visibleChat = tripId;
};
export const isChatVisible = (tripId: unknown) => typeof tripId === "string" && tripId === visibleChat;

/** Activity cards on the trip screen by id, so a chat link can scroll to the exact stop. */
export const activityViews = new Map<string, { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void }>();
