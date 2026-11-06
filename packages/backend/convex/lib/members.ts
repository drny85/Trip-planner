import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Everyone on a trip, owner first. Synthesizes the owner for trips made before members existed. */
export async function listMembers(ctx: QueryCtx | MutationCtx, trip: Doc<"trips">) {
  const rows = await ctx.db
    .query("tripMembers")
    .withIndex("by_tripId", (q) => q.eq("tripId", trip._id))
    .collect();
  // Member rows can be saved without a photo, or with the "Traveler" fallback name, when the
  // sign-in token had neither. Fill those in from the person's profile.
  const withProfiles = await Promise.all(
    rows.map(async (row) => {
      if (row.imageUrl && row.name && row.name !== "Traveler") return row;
      const profile = await profileFor(ctx, row.userId);
      return {
        ...row,
        name: (row.name && row.name !== "Traveler" ? row.name : profile?.name) || row.name,
        imageUrl: row.imageUrl ?? profile?.imageUrl,
      };
    }),
  );
  const owner = withProfiles.find((r) => r.userId === trip.userId);
  const others = withProfiles.filter((r) => r.userId !== trip.userId);
  if (owner) return [owner, ...others];
  // No member row for the owner (older or AI-planned trips): use their profile, so the
  // apps show their name and photo instead of a "Trip owner" placeholder.
  const profile = await profileFor(ctx, trip.userId);
  return [{ userId: trip.userId, role: "owner" as const, name: profile?.name || "Trip owner", imageUrl: profile?.imageUrl }, ...others];
}

function profileFor(ctx: QueryCtx | MutationCtx, clerkId: string) {
  return ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}
