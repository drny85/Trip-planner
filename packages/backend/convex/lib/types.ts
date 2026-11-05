import type { Doc } from "../_generated/dataModel";
import type { ActivityNode } from "./tree";

/**
 * Shape returned by `trips.get`: the trip with its days. Each day's `activities`
 * are the top-level ones; sub-activities hang off `children`, to any depth.
 */
export type TripDetails = Doc<"trips"> & {
  subTrips: Array<Doc<"subTrips"> & { activities: ActivityNode[] }>;
  progress: { completed: number; total: number };
};

/** What a share link exposes: the itinerary without owner fields. */
export type PublicTripDetails = Omit<TripDetails, "userId" | "prompt" | "shareToken">;

export type Trip = Doc<"trips">;
export type SubTrip = Doc<"subTrips">;
export type Activity = ActivityNode;
export type { ActivityNode };

export type { ActivityInput, SubTripInput, TripTreeInput } from "./validators";
