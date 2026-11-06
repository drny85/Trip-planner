/**
 * Group voting on the itinerary. Everyone on a trip can give any stop (an
 * activity, a restaurant, a hotel) a thumbs up or down, and star up to three
 * top picks, ranked in the order they starred them.
 *
 * Points per person: 👎 = -1, 👍 = +1, and a top pick replaces the 👍 with
 * #1 = 4, #2 = 3, #3 = 2. A stop's score is the sum over everyone on the trip.
 *
 * Fairness, used when the AI rebuilds the plan around the votes:
 * - Everyone's #1 pick is always kept.
 * - A stop can only be dropped when nobody starred it, more people voted it down
 *   than up, and at least half of the trip voted it down.
 * - Ties in the ranking go to the stop backed by the people whose favorites have
 *   made it in least so far, so one loud voter can't take every close call.
 *
 * Pure functions only: the queries, mutations and the AI action share them.
 */

export const MAX_PICKS = 3;

export type VoteValue = "up" | "down";
export type VoteRow = { activityId: string; userId: string; value?: VoteValue; pick?: number };

/** One person's points for one stop. */
export function personPoints(vote: Pick<VoteRow, "value" | "pick">) {
  if (vote.pick) return 1 + (MAX_PICKS + 1 - vote.pick);
  if (vote.value === "up") return 1;
  if (vote.value === "down") return -1;
  return 0;
}

export type Tally = {
  activityId: string;
  up: number;
  down: number;
  /** How many people starred it as a top pick, and how many as their #1. */
  picks: number;
  firstPicks: number;
  score: number;
  /** Who voted up or starred it. */
  supporters: string[];
};

const emptyTally = (activityId: string): Tally => ({ activityId, up: 0, down: 0, picks: 0, firstPicks: 0, score: 0, supporters: [] });

/** Tallies per stop. Votes from people no longer on the trip don't count. */
export function tallyVotes(votes: VoteRow[], memberIds: Iterable<string>): Map<string, Tally> {
  const members = new Set(memberIds);
  const out = new Map<string, Tally>();
  for (const vote of votes) {
    if (!members.has(vote.userId)) continue;
    const t = out.get(vote.activityId) ?? emptyTally(vote.activityId);
    if (vote.value === "down") t.down++;
    else if (vote.value === "up" || vote.pick) {
      t.up++;
      t.supporters.push(vote.userId);
    }
    if (vote.pick) {
      t.picks++;
      if (vote.pick === 1) t.firstPicks++;
    }
    t.score += personPoints(vote);
    out.set(vote.activityId, t);
  }
  return out;
}

/** Whether the group has voted a stop out (see the fairness rules above). */
export const isDropCandidate = (t: Tally | undefined, memberCount: number) =>
  Boolean(t && t.picks === 0 && t.down > t.up && t.down * 2 >= memberCount);

/** Each person's #1 pick: these always stay in the plan. */
export const firstPicks = (votes: VoteRow[], memberIds: Iterable<string>) => {
  const members = new Set(memberIds);
  return new Set(votes.filter((v) => v.pick === 1 && members.has(v.userId)).map((v) => v.activityId));
};

export type TieBreak = "fairness" | "fewerDowns" | "moreSupporters" | "order";
export type Ranked = { activityId: string; score: number; rank: number; tieBrokenBy?: TieBreak };

/**
 * Orders stops from most to least wanted. Higher score first. On a tie, the stop
 * whose supporters have had the least of what they liked ranked so far wins
 * (each supporter weighs 1 / (1 + points already won)); then fewer 👎; then more
 * people behind it; then itinerary order. `ids` is in itinerary order.
 */
export function fairRanking(ids: string[], tallies: Map<string, Tally>, votes: VoteRow[]): Ranked[] {
  const won = new Map<string, number>();
  const pointsOf = new Map(votes.map((v) => [`${v.userId}|${v.activityId}`, personPoints(v)]));
  const index = new Map(ids.map((id, i) => [id, i]));
  const tally = (id: string) => tallies.get(id) ?? emptyTally(id);
  const weight = (id: string) => tally(id).supporters.reduce((sum, m) => sum + 1 / (1 + (won.get(m) ?? 0)), 0);

  const criteria: [TieBreak | "score", (a: string, b: string) => number][] = [
    ["score", (a, b) => tally(b).score - tally(a).score],
    ["fairness", (a, b) => weight(b) - weight(a)],
    ["fewerDowns", (a, b) => tally(a).down - tally(b).down],
    ["moreSupporters", (a, b) => tally(b).supporters.length - tally(a).supporters.length],
    ["order", (a, b) => index.get(a)! - index.get(b)!],
  ];
  const EPS = 1e-9;
  const compare = (a: string, b: string) => {
    for (const [, fn] of criteria) {
      const d = fn(a, b);
      if (Math.abs(d) > EPS) return d;
    }
    return 0;
  };

  const remaining = [...new Set(ids)];
  const out: Ranked[] = [];
  while (remaining.length) {
    remaining.sort(compare);
    const [best, next] = remaining;
    const t = tally(best!);
    let tieBrokenBy: TieBreak | undefined;
    // A real tie: same score, and both have votes (two unvoted stops aren't a contest).
    if (next !== undefined && tally(next).score === t.score && (t.up + t.down > 0 || tally(next).up + tally(next).down > 0)) {
      tieBrokenBy = criteria.slice(1).find(([, fn]) => Math.abs(fn(best!, next)) > EPS)?.[0] as TieBreak | undefined;
    }
    out.push({ activityId: best!, score: t.score, rank: out.length + 1, tieBrokenBy });
    for (const m of t.supporters) won.set(m, (won.get(m) ?? 0) + (pointsOf.get(`${m}|${best}`) ?? 0));
    remaining.shift();
  }
  return out;
}

// ------------------------------------------------------------ plan checking

export type PlanInputDay = { id: string; activities: { id: string; locked: boolean; done: boolean; startTime?: string }[] };
export type RawPlan = {
  days: { dayId: string; activities: { id: string; startTime?: string }[] }[];
  dropped: { id: string; reason?: string }[];
};
export type CheckedPlan = {
  days: { subTripId: string; items: { activityId: string; startTime?: string; movedFrom?: string }[] }[];
  dropped: { activityId: string; reason?: string }[];
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Makes whatever the model returned safe to apply: every stop ends up exactly
 * once, either on a day or dropped. Done, booked and transport/hotel stops
 * ("locked") stay on their own day with their own time. Only stops the group
 * voted out can be dropped; anything else the model dropped or forgot goes back
 * next to where it was. Unknown ids are ignored.
 */
export function checkPlan(input: PlanInputDay[], plan: RawPlan, droppable: Set<string>): CheckedPlan {
  const home = new Map<string, { day: string; index: number; locked: boolean; done: boolean; startTime?: string }>();
  for (const day of input) day.activities.forEach((a, index) => home.set(a.id, { day: day.id, index, locked: a.locked, done: a.done, startTime: a.startTime }));

  const placed = new Set<string>();
  const result = new Map(input.map((d) => [d.id, [] as CheckedPlan["days"][number]["items"]]));
  const dropped: CheckedPlan["dropped"] = [];

  for (const d of plan.dropped) {
    const h = home.get(d.id);
    if (!h || placed.has(d.id) || h.locked || h.done || !droppable.has(d.id)) continue;
    placed.add(d.id);
    dropped.push({ activityId: d.id, reason: d.reason?.trim().slice(0, 200) || undefined });
  }

  for (const day of plan.days) {
    const list = result.get(day.dayId);
    if (!list) continue;
    for (const a of day.activities) {
      const h = home.get(a.id);
      if (!h || placed.has(a.id)) continue;
      // Locked stops can't change day; they're put back below.
      if ((h.locked || h.done) && h.day !== day.dayId) continue;
      placed.add(a.id);
      const time = h.done ? h.startTime : a.startTime && TIME.test(a.startTime) ? a.startTime : h.startTime;
      list.push({ activityId: a.id, startTime: time, movedFrom: h.day !== day.dayId ? h.day : undefined });
    }
  }

  // Put back what's left, right after the last stop that came before it on its day.
  for (const day of input) {
    for (const a of day.activities) {
      if (placed.has(a.id)) continue;
      placed.add(a.id);
      const list = result.get(day.id)!;
      const h = home.get(a.id)!;
      let at = 0;
      list.forEach((item, i) => {
        const other = home.get(item.activityId)!;
        if (other.day === day.id && other.index < h.index) at = i + 1;
      });
      list.splice(at, 0, { activityId: a.id, startTime: a.startTime });
    }
  }

  return { days: input.map((d) => ({ subTripId: d.id, items: result.get(d.id)! })), dropped };
}

/** The plan without AI: same days and order, minus what the group voted out. */
export const votesOnlyPlan = (input: PlanInputDay[], droppable: Set<string>): CheckedPlan =>
  checkPlan(
    input,
    {
      days: input.map((d) => ({ dayId: d.id, activities: d.activities.filter((a) => a.locked || a.done || !droppable.has(a.id)) })),
      dropped: input.flatMap((d) => d.activities.filter((a) => droppable.has(a.id)).map((a) => ({ id: a.id }))),
    },
    droppable,
  );
