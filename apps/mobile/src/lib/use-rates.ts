import { api } from "@trip/backend/api";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";

/** Rates fetched this session, so switching currencies back and forth doesn't refetch. */
const cache = new Map<string, number | null>();

/** How many `display` one unit of each code buys, from today's rates. */
export function useRates(codes: string[], display: string) {
  const fetchRate = useAction(api.fx.rate);
  const key = codes.map((c) => `${c}>${display}`).join(",");
  const [, rerender] = useState(0);
  useEffect(() => {
    let live = true;
    const todo = codes.filter((c) => !cache.has(`${c}>${display}`));
    if (todo.length === 0) return;
    void Promise.all(
      todo.map((from) =>
        fetchRate({ from, to: display })
          .then((r) => cache.set(`${from}>${display}`, r?.rate ?? null))
          .catch(() => cache.set(`${from}>${display}`, null)),
      ),
    ).then(() => live && rerender((n) => n + 1));
    return () => {
      live = false;
    };
    // Only refetch when the set of pairs changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const rates: Record<string, number> = {};
  let loading = false;
  for (const c of codes) {
    const r = cache.get(`${c}>${display}`);
    if (r === undefined) loading = true;
    else if (r != null) rates[c] = r;
  }
  return { rates, loading };
}
