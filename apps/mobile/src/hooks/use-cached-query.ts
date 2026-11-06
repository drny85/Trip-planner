import { useConvexConnectionState, useQuery } from "convex/react";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { useNetworkState } from "expo-network";
import { applyPendingToPacking, applyPendingToTrip, type PendingCheck } from "@trip/backend/offline";
import { useEffect, useMemo } from "react";
import { readCache, writeCache } from "@/lib/offline-cache";
import { useOutbox } from "@/lib/outbox";

/** Queries that show check-offs: they also show the ones still waiting to sync. */
const withPending: Partial<Record<string, (value: never, queue: PendingCheck[]) => unknown>> = {
  "trips:get": applyPendingToTrip,
  "packing:list": applyPendingToPacking,
};

/**
 * `useQuery` that remembers its last result on the device. While loading or
 * offline it returns the saved copy, with `isCached: true`, instead of a spinner.
 * Trips and packing lists also show check-offs still waiting in the outbox.
 * `"skip"` loads nothing, as with `useQuery`.
 */
export function useCachedQuery<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q> | "skip") {
  const name = getFunctionName(query);
  const key = args === "skip" ? null : `${name}:${JSON.stringify(args)}`;
  const live = useQuery(query, args);
  const cached = useMemo(() => (key ? readCache<FunctionReturnType<Q>>(key) : undefined), [key]);

  useEffect(() => {
    if (key && live !== undefined) writeCache(key, live);
  }, [key, live]);

  const { queue } = useOutbox();
  const overlay = withPending[name];
  const raw = live !== undefined ? live : cached;
  const data = useMemo(
    () => (overlay && queue.length > 0 && raw != null ? (overlay(raw as never, queue) as FunctionReturnType<Q>) : raw),
    [overlay, queue, raw],
  );
  return { data, isCached: live === undefined && cached !== undefined };
}

/**
 * True when the phone has no internet (straight from the OS, so it shows the
 * moment airplane mode goes on, even on a cold start with no signal), or once
 * the app has lost its connection to the backend.
 */
export function useIsOffline() {
  const state = useConvexConnectionState();
  const network = useNetworkState();
  if (network.isConnected === false || network.isInternetReachable === false) return true;
  return state.hasEverConnected ? !state.isWebSocketConnected : false;
}
