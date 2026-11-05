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
    /** Model that generated the trip (picked per request by lib/modelRouter.ts). */
    aiModel: v.optional(v.string()),
    /** Random token for the read-only share link. Absent means the trip is private. */
    shareToken: v.optional(v.string()),
    /** Random token for the "join this trip" link. Absent means invites are off. */
    inviteToken: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_startDate", ["userId", "startDate"])
    .index("by_shareToken", ["shareToken"])
    .index("by_inviteToken", ["inviteToken"]),

  /**
   * Everyone going on a trip. The owner (`trips.userId`) has a row too, so votes
   * count everyone. Members can see the trip, check things off, suggest and vote;
   * the owner also edits the itinerary directly.
   */
  tripMembers: defineTable({
    tripId: v.id("trips"),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("member")),
    name: v.string(),
    imageUrl: v.optional(v.string()),
  })
    .index("by_tripId", ["tripId"])
    .index("by_userId", ["userId"])
    .index("by_tripId_userId", ["tripId", "userId"]),

  /**
   * An activity a member proposes for a day. It's added to the itinerary once more
   * than half of the members vote yes, and dropped once that can no longer happen.
   */
  suggestions: defineTable({
    tripId: v.id("trips"),
    subTripId: v.id("subTrips"),
    authorId: v.string(),
    ...activityFields,
    status: v.union(v.literal("open"), v.literal("accepted"), v.literal("rejected"), v.literal("withdrawn")),
    resolvedAt: v.optional(v.number()),
    /** The activity created when it was accepted. */
    activityId: v.optional(v.id("activities")),
  })
    .index("by_tripId_status", ["tripId", "status"])
    .index("by_subTripId", ["subTripId"]),

  /** Photos travelers add to an activity, to relive the trip later. */
  memories: defineTable({
    tripId: v.id("trips"),
    activityId: v.id("activities"),
    storageId: v.id("_storage"),
    uploadedBy: v.string(),
    caption: v.optional(v.string()),
  })
    .index("by_tripId", ["tripId"])
    .index("by_activityId", ["activityId"])
    .index("by_storageId", ["storageId"]),

  /** Shared packing list: anyone on the trip adds, ticks off or claims items. */
  /** Shared costs. A settlement is a payment from `paidBy` to the one person in `splitAmong`. */
  expenses: defineTable({
    tripId: v.id("trips"),
    description: v.string(),
    amountCents: v.number(),
    paidBy: v.string(),
    splitAmong: v.array(v.string()),
    createdBy: v.string(),
    isSettlement: v.optional(v.boolean()),
  }).index("by_tripId", ["tripId"]),

  /** In-app notifications, one row per recipient. */
  notifications: defineTable({
    userId: v.string(),
    tripId: v.id("trips"),
    kind: v.union(v.literal("idea"), v.literal("accepted"), v.literal("rejected"), v.literal("joined"), v.literal("expense"), v.literal("settled")),
    text: v.string(),
    isRead: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_isRead", ["userId", "isRead"])
    .index("by_tripId", ["tripId"]),

  /** Expo push tokens, one per phone. */
  pushTokens: defineTable({ userId: v.string(), token: v.string() }).index("by_userId", ["userId"]).index("by_token", ["token"]),

  packingItems: defineTable({
    tripId: v.id("trips"),
    text: v.string(),
    isPacked: v.boolean(),
    addedBy: v.string(),
    /** Who's bringing it, for shared things like a first-aid kit. */
    claimedBy: v.optional(v.string()),
  }).index("by_tripId", ["tripId"]),

  votes: defineTable({
    suggestionId: v.id("suggestions"),
    tripId: v.id("trips"),
    userId: v.string(),
    value: v.union(v.literal("yes"), v.literal("no")),
  })
    .index("by_suggestionId", ["suggestionId"])
    .index("by_suggestionId_userId", ["suggestionId", "userId"])
    .index("by_tripId", ["tripId"]),

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
    /** Set on a sub-activity: the activity it belongs to. Nesting can go any depth. */
    parentId: v.optional(v.id("activities")),
    ...activityFields,
    isCompleted: v.boolean(),
    completedAt: v.optional(v.number()),
    order: v.number(),
  })
    .index("by_subTripId_order", ["subTripId", "order"])
    .index("by_subTripId_parentId_order", ["subTripId", "parentId", "order"])
    .index("by_parentId", ["parentId"])
    .index("by_tripId", ["tripId"]),
});
