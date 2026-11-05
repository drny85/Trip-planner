import type { Id } from "../_generated/dataModel";
import type { ReplanProposal } from "../ai";

/** Turns a re-plan proposal into the arguments `activities.applyReplan` takes. */
export function toApplyArgs(proposal: ReplanProposal) {
  return proposal.activities.map((a) =>
    "keepId" in a ? { keepId: a.keepId as Id<"activities">, startTime: a.startTime, durationMinutes: a.durationMinutes } : (({ isNew: _n, ...rest }) => rest)(a),
  );
}
