/**
 * Local tips and crowd forecasts, shared by web and mobile. Types mirror the
 * backend validators (packages/backend/convex/lib/validators.ts).
 */
export type TipKind = "time" | "order" | "free" | "insider" | "avoid";
export type CrowdLevel = "quiet" | "moderate" | "busy" | "packed";
export type Crowd = { level: CrowdLevel; peakFrom?: string; peakTo?: string; bestTime?: string };

export const TIP_EMOJI: Record<TipKind, string> = { time: "⏰", order: "🍽️", free: "🎟️", insider: "🤫", avoid: "🚫" };

/** Bars out of 4, and a Tailwind background class for each level (exists on web and in Uniwind). */
export const CROWD_META: Record<CrowdLevel, { bars: number; className: string; emoji: string }> = {
  quiet: { bars: 1, className: "bg-emerald-500", emoji: "🟢" },
  moderate: { bars: 2, className: "bg-amber-400", emoji: "🟡" },
  busy: { bars: 3, className: "bg-orange-500", emoji: "🟠" },
  packed: { bars: 4, className: "bg-rose-500", emoji: "🔴" },
};

/** The stretch of the day the crowd bar shows. */
export const CROWD_DAY = { from: 6 * 60, to: 24 * 60 } as const;

const minutes = (time?: string) => {
  const m = time ? /^(\d{1,2}):(\d{2})$/.exec(time) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** Position of a time on the crowd bar, 0–100, or null when it's not a time. */
export function crowdPosition(time?: string) {
  const m = minutes(time);
  if (m === null) return null;
  const clamped = Math.min(CROWD_DAY.to, Math.max(CROWD_DAY.from, m));
  return ((clamped - CROWD_DAY.from) / (CROWD_DAY.to - CROWD_DAY.from)) * 100;
}

/** Whether the planned time falls in the busiest stretch. */
export function inPeak(crowd: Crowd, startTime?: string) {
  const at = minutes(startTime);
  const from = minutes(crowd.peakFrom);
  const to = minutes(crowd.peakTo);
  return at !== null && from !== null && to !== null && at >= from && at < to;
}

/**
 * A better time to go, worth suggesting: there is a best time, it's not the
 * planned time, and the plan is busy (or in the peak).
 */
export function betterTime(crowd: Crowd, startTime?: string) {
  if (!crowd.bestTime || crowd.bestTime === startTime) return null;
  return crowd.level === "busy" || crowd.level === "packed" || inPeak(crowd, startTime) ? crowd.bestTime : null;
}

/** Everything the crowd bar draws, as percentages along the day. */
export function crowdBar(crowd: Crowd, startTime?: string) {
  const from = crowdPosition(crowd.peakFrom);
  const to = crowdPosition(crowd.peakTo);
  return {
    peak: from !== null && to !== null && to > from ? { left: from, width: to - from } : null,
    planned: crowdPosition(startTime),
    best: crowdPosition(crowd.bestTime),
  };
}
