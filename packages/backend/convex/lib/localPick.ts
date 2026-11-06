import type { Id } from "../_generated/dataModel";
import type { LocalPickProposal } from "../ai";
import type { CrowdLevel } from "./validators";

/** Turns a local's-pick proposal into the arguments `localPicks.apply` takes. */
export function toLocalPickArgs(proposal: LocalPickProposal) {
  return proposal.activities.map((a) =>
    "keepId" in a
      ? { keepId: a.keepId as Id<"activities">, startTime: a.startTime, durationMinutes: a.durationMinutes, localTips: a.localTips, crowd: a.crowd }
      : (({ isNew: _n, replaces: _r, ...rest }) => rest)(a),
  );
}

export type { CrowdLevel, LocalPickProposal };
export type { TipKind } from "./validators";
