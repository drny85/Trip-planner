import type { Doc } from "../_generated/dataModel";

/** Shape returned by `trips.get`: the trip with its days and their activities. */
export type TripDetails = Doc<"trips"> & {
  subTrips: Array<Doc<"subTrips"> & { activities: Doc<"activities">[] }>;
  progress: { completed: number; total: number };
};

/** What a share link exposes: the itinerary without owner fields. */
export type PublicTripDetails = Omit<TripDetails, "userId" | "prompt" | "shareToken">;

export type Trip = Doc<"trips">;
export type SubTrip = Doc<"subTrips">;
export type Activity = Doc<"activities">;

export type { ActivityInput, SubTripInput, TripTreeInput } from "./validators";
