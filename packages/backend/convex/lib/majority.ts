/**
 * Majority rule for suggestions: accepted once yes votes are more than half of
 * the trip's members; rejected as soon as that can no longer happen, even if
 * everyone left votes yes.
 */
export type Tally = { yes: number; no: number; members: number };

export function decide({ yes, no, members }: Tally): "accepted" | "rejected" | "open" {
  const needed = Math.floor(members / 2) + 1;
  if (yes >= needed) return "accepted";
  if (members - no < needed) return "rejected";
  return "open";
}

/** Yes votes still needed to pass. */
export const yesNeeded = ({ yes, members }: Tally) => Math.max(0, Math.floor(members / 2) + 1 - yes);
