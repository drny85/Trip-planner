import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getCallerProfile } from "./auth";

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** True for a real calendar date written "YYYY-MM-DD". */
export function isIsoDate(value: string) {
  if (!ISO_DATE.test(value)) return false;
  const ms = toMs(value);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** `iso` moved by `days` (negative goes back). */
export function shiftDate(iso: string, days: number) {
  return new Date(toMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: string, to: string) {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/**
 * Copies a trip's days and activities (sub-activities at any depth) to a new
 * trip owned by `userId`, moved so it starts on `startDate`. Everything starts
 * unchecked: no completions, no money spent, no members, memories or bookings.
 */
export async function copyTripTree(
  ctx: MutationCtx,
  source: Doc<"trips">,
  args: { userId: string; startDate: string },
): Promise<Id<"trips">> {
  const offset = daysBetween(source.startDate, args.startDate);
  const tripId = await ctx.db.insert("trips", {
    userId: args.userId,
    title: source.title,
    destination: source.destination,
    description: source.description,
    startDate: args.startDate,
    endDate: shiftDate(source.endDate, offset),
    imageUrl: source.imageUrl,
    currency: source.currency,
    isAIGenerated: source.isAIGenerated,
    copiedFromTripId: source._id,
  });
  const owner = await getCallerProfile(ctx);
  await ctx.db.insert("tripMembers", { tripId, userId: args.userId, role: "owner", ...owner });

  const [subTrips, activities] = await Promise.all([
    ctx.db
      .query("subTrips")
      .withIndex("by_tripId_order", (q) => q.eq("tripId", source._id))
      .collect(),
    ctx.db
      .query("activities")
      .withIndex("by_tripId", (q) => q.eq("tripId", source._id))
      .collect(),
  ]);

  const newDay = new Map<Id<"subTrips">, Id<"subTrips">>();
  for (const { _id, _creationTime, tripId: _old, date, ...day } of subTrips) {
    newDay.set(_id, await ctx.db.insert("subTrips", { ...day, tripId, date: date && shiftDate(date, offset) }));
  }

  // Parents before children, so each child can point at its parent's copy.
  const children = new Map<string, Doc<"activities">[]>();
  for (const a of activities) {
    const key = a.parentId ?? "root";
    children.set(key, [...(children.get(key) ?? []), a]);
  }
  const copyLevel = async (parent: Id<"activities"> | "root", newParent?: Id<"activities">) => {
    for (const a of children.get(parent) ?? []) {
      const subTripId = newDay.get(a.subTripId);
      if (!subTripId) continue;
      const {
        _id,
        _creationTime,
        tripId: _old,
        subTripId: _oldDay,
        parentId: _oldParent,
        isCompleted: _done,
        completedAt: _doneAt,
        actualCost: _spent,
        ...fields
      } = a;
      const id = await ctx.db.insert("activities", { ...fields, tripId, subTripId, parentId: newParent, isCompleted: false });
      await copyLevel(_id, id);
    }
  };
  await copyLevel("root");

  return tripId;
}
