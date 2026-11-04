import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { activityFields } from "./lib/validators";

export default defineSchema({
  /** One row per Clerk user. `clerkId` is the JWT `subject`. */
  users: defineTable({
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  }).index("by_clerkId", ["clerkId"]),

  trips: defineTable({
    /** Clerk user id (identity.subject), or the demo user before auth is wired. */
    userId: v.string(),
    title: v.string(),
    destination: v.string(),
    description: v.optional(v.string()),
    /** ISO dates "YYYY-MM-DD"; strings sort and compare correctly. */
    startDate: v.string(),
    endDate: v.string(),
    imageUrl: v.string(),
    currency: v.optional(v.string()),
    isAIGenerated: v.boolean(),
    /** The prompt used for AI generation, kept so a trip can be regenerated. */
    prompt: v.optional(v.string()),
    /** Random token for the read-only share link. Absent means the trip is private. */
    shareToken: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_startDate", ["userId", "startDate"])
    .index("by_shareToken", ["shareToken"]),

  /** A day ("Day 1") or a leg ("Kyoto Leg") of a trip. */
  subTrips: defineTable({
    tripId: v.id("trips"),
    title: v.string(),
    dayNumber: v.number(),
    date: v.optional(v.string()),
    location: v.optional(v.string()),
    order: v.number(),
  }).index("by_tripId_order", ["tripId", "order"]),

  activities: defineTable({
    subTripId: v.id("subTrips"),
    /** Denormalized so a whole trip's activities load with one index read. */
    tripId: v.id("trips"),
    ...activityFields,
    isCompleted: v.boolean(),
    completedAt: v.optional(v.number()),
    order: v.number(),
  })
    .index("by_subTripId_order", ["subTripId", "order"])
    .index("by_tripId", ["tripId"]),
});
