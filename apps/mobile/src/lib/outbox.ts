import { enqueue, pendingKey, settle, type PendingCheck } from "@trip/backend/offline";
import { useSyncExternalStore } from "react";
import { readCache, writeCache } from "./offline-cache";

/**
 * Check-offs waiting for a connection. Saved on the phone (so closing the app
 * doesn't lose them), shown on the saved trip right away, and sent by
 * <OfflineSync /> once the app is back online.
 */
const KEY = "outbox:v1";
const SYNCED_MS = 3500;

type State = {
  queue: PendingCheck[];
  /** How many check-offs the last sync sent, for a few seconds after; drives the "synced" pill. */
  lastSync: { count: number; at: number } | null;
};

let state: State = { queue: readCache<PendingCheck[]>(KEY) ?? [], lastSync: null };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  if (next.queue) writeCache(KEY, next.queue);
  for (const l of listeners) l();
}

export const outbox = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  add(op: PendingCheck) {
    set({ queue: enqueue(state.queue, op) });
  },
  /** Takes back a queued tap (Undo before it ever reached the server). Returns whether there was one. */
  cancel(key: string) {
    const queue = state.queue.filter((o) => pendingKey(o) !== key);
    if (queue.length === state.queue.length) return false;
    set({ queue });
    return true;
  },
  has: (key: string) => state.queue.some((o) => pendingKey(o) === key),
  /** Removes a tap once the server has it (or turned it down). */
  settle(op: PendingCheck) {
    set({ queue: settle(state.queue, op) });
  },
  synced(count: number) {
    const at = Date.now();
    set({ lastSync: { count, at } });
    setTimeout(() => {
      if (state.lastSync?.at === at) set({ lastSync: null });
    }, SYNCED_MS);
  },
  /** On sign-out, along with the saved trips. */
  clear() {
    set({ queue: [], lastSync: null });
  },
};

/** The outbox, re-rendering when it changes. */
export function useOutbox() {
  return useSyncExternalStore(outbox.subscribe, outbox.get, outbox.get);
}
