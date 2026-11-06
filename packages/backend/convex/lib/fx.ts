/**
 * Exchange rates from free, keyless sources: Frankfurter (European Central Bank
 * reference rates) first, then open.er-api.com, which covers many more currencies.
 */
export type Rate = { rate: number; source: string; date: string };

const isCode = (c: string) => /^[A-Z]{3}$/.test(c);

export async function fetchRate(from: string, to: string, fetcher: typeof fetch = fetch): Promise<Rate | null> {
  if (!isCode(from) || !isCode(to)) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (from === to) return { rate: 1, source: "same", date: today };
  try {
    const res = await fetcher(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`);
    if (res.ok) {
      const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
      const rate = body.rates?.[to];
      if (typeof rate === "number" && rate > 0) return { rate, source: "ECB via frankfurter.dev", date: body.date ?? today };
    }
  } catch {
    // Try the next source.
  }
  try {
    const res = await fetcher(`https://open.er-api.com/v6/latest/${from}`);
    if (res.ok) {
      const body = (await res.json()) as { result?: string; time_last_update_utc?: string; rates?: Record<string, number> };
      const rate = body.rates?.[to];
      if (body.result === "success" && typeof rate === "number" && rate > 0) {
        const date = body.time_last_update_utc ? new Date(body.time_last_update_utc).toISOString().slice(0, 10) : today;
        return { rate, source: "open.er-api.com", date };
      }
    }
  } catch {
    // No source had it.
  }
  return null;
}
