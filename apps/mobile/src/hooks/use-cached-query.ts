import { useConvexConnectionState, useQuery } from "convex/react";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { useEffect, useMemo } from "react";
import { readCache, writeCache } from "@/lib/offline-cache";

/**
 * `useQuery` that remembers its last result on the device. While loading or
 * offline it returns the saved copy, with `isCached: true`, instead of a spinner.
 */
export function useCachedQuery<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q>) {
  const key = `${getFunctionName(query)}:${JSON.stringify(args)}`;
  const live = useQuery(query, args);
  const cached = useMemo(() => readCache<FunctionReturnType<Q>>(key), [key]);

  useEffect(() => {
    if (live !== undefined) writeCache(key, live);
  }, [key, live]);

  return live !== undefined ? { data: live, isCached: false } : { data: cached, isCached: cached !== undefined };
}

/** True once the app has lost its connection to the backend. */
export function useIsOffline() {
  const state = useConvexConnectionState();
  return state.hasEverConnected ? !state.isWebSocketConnected : false;
}
