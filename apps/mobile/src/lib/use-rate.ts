import { api } from "@trip/backend/api";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";

const rateText = (r: number) => String(Number(r.toPrecision(6)));
const readRate = (text: string) => {
  const n = Number(text.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The exchange rate from `from` into `to`, as editable text: today's rate is fetched
 * whenever the pair changes, unless `initial` already has one for it.
 */
export function useRate(from: string, to: string, initial?: { currency: string; rate: number }) {
  const fetchRate = useAction(api.fx.rate);
  const pair = `${from}>${to}`;
  const known = initial && initial.currency === from;
  const [state, setState] = useState<{ pair: string; text: string; status: "ok" | "missing"; date?: string }>(() => ({
    pair: known ? pair : "",
    text: known ? rateText(initial.rate) : "",
    status: "ok",
  }));
  useEffect(() => {
    if (from === to || state.pair === pair) return;
    let live = true;
    fetchRate({ from, to })
      .then((r) => live && setState({ pair, text: r ? rateText(r.rate) : "", status: r ? "ok" : "missing", date: r?.date }))
      .catch(() => live && setState({ pair, text: "", status: "missing" }));
    return () => {
      live = false;
    };
    // Only refetch when the currency pair changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair]);
  const same = from === to;
  const loading = !same && state.pair !== pair;
  return {
    same,
    text: same ? "1" : loading ? "" : state.text,
    setText: (text: string) => setState({ pair, text, status: "ok" }),
    status: same ? ("ok" as const) : loading ? ("loading" as const) : state.status,
    date: loading ? undefined : state.date,
    rate: same ? 1 : loading ? null : readRate(state.text),
  };
}

export { rateText };
