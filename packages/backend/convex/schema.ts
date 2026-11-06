import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { bookingFields, bookingObject, placementObject } from "./lib/bookings";
import { activityFields, splitMode } from "./lib/validators";

export default defineSchema({
  /** One row per Clerk user. `clerkId` is the JWT `subject`. */
  users: defineTable({
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    /** App language ("en", "es", …), so notifications reach them in it. */
    language: v.optional(v.string()),
    /** ISO 4217 code of where they travel from, e.g. "USD". Guessed from the device, can be changed. */
    homeCurrency: v.optional(v.string()),
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
    /** The destination's local currency (ISO 4217), e.g. "JPY". */
    currency: v.optional(v.string()),
    /**
     * The one currency shared-cost balances are kept in. Set when the first expense is
     * added (the organizer's home currency), and the organizer can change it.
     */
    groupCurrency: v.optional(v.string()),
    isAIGenerated: v.boolean(),
    /** The prompt used for AI generation, kept so a trip can be regenerated. */
    prompt: v.optional(v.string()),
    /** Model that generated the trip (picked per request by lib/modelRouter.ts). */
    aiModel: v.optional(v.string()),
    /** Random token for the read-only share link. Absent means the trip is private. */
    shareToken: v.optional(v.string()),
    /** Random token for the "join this trip" link. Absent means invites are off. */
    inviteToken: v.optional(v.string()),
    /** Random token in the trip's "forward bookings here" email address. Absent means it's off. */
    importToken: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_startDate", ["userId", "startDate"])
    .index("by_shareToken", ["shareToken"])
    .index("by_inviteToken", ["inviteToken"])
    .index("by_importToken", ["importToken"]),

  /**
   * One confirmation a traveler pasted, uploaded or forwarded. AI reads it in the
   * background (`processing`), then the bookings it found wait for review
   * (`ready`) until the traveler adds them to the itinerary (`applied`).
   */
  bookingImports: defineTable({
    tripId: v.id("trips"),
    /** Who it belongs to: the traveler who pasted or uploaded it, or the trip owner for a forwarded email. */
    userId: v.string(),
    source: v.union(v.literal("text"), v.literal("file"), v.literal("email")),
    /** The pasted or forwarded text. Cleared once the import is resolved. */
    text: v.optional(v.string()),
    /** The uploaded PDF or screenshot. Deleted once it has been read. */
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    /** A forwarded email's subject and sender, to recognize it in the list. */
    subject: v.optional(v.string()),
    from: v.optional(v.string()),
    status: v.union(v.literal("processing"), v.literal("ready"), v.literal("failed"), v.literal("applied"), v.literal("dismissed")),
    error: v.optional(v.string()),
    proposals: v.optional(v.array(v.object({ booking: bookingObject, placement: placementObject }))),
    aiModel: v.optional(v.string()),
    /** App language of the person reviewing it: titles and messages are written in it. */
    language: v.optional(v.string()),
  })
    .index("by_tripId", ["tripId"])
    .index("by_tripId_userId", ["tripId", "userId"]),

  /** A confirmed reservation on a trip, linked to the itinerary activity it shows on. */
  bookings: defineTable({
    tripId: v.id("trips"),
    activityId: v.optional(v.id("activities")),
    importId: v.optional(v.id("bookingImports")),
    addedBy: v.string(),
    ...bookingFields,
  })
    .index("by_tripId", ["tripId"])
    .index("by_activityId", ["activityId"]),

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

  /** Trip journal: a short note from one traveler on a completed activity (one per person per activity). */
  journalNotes: defineTable({
    tripId: v.id("trips"),
    activityId: v.id("activities"),
    authorId: v.string(),
    text: v.string(),
  })
    .index("by_tripId", ["tripId"])
    .index("by_activityId_authorId", ["activityId", "authorId"]),

  /**
   * The AI-written story of a trip, built from what was done, the journal notes
   * and the photos. One per trip; writing it again replaces it. When published,
   * it's public at /share/<trip shareToken>/story.
   */
  tripStories: defineTable({
    tripId: v.id("trips"),
    status: v.union(v.literal("writing"), v.literal("ready"), v.literal("failed")),
    requestedBy: v.string(),
    requestedAt: v.number(),
    title: v.optional(v.string()),
    intro: v.optional(v.string()),
    chapters: v.optional(
      v.array(
        v.object({
          subTripId: v.id("subTrips"),
          heading: v.string(),
          body: v.string(),
          /** Highlights the chapter mentions, in the order they happened. */
          activityIds: v.array(v.id("activities")),
        }),
      ),
    ),
    closing: v.optional(v.string()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    isPublished: v.boolean(),
  }).index("by_tripId", ["tripId"]),

  /** Shared packing list: anyone on the trip adds, ticks off or claims items. */
  /**
   * Shared costs: something `paidBy` paid for the people in `splitAmong`.
   * How it's divided is `splitMode` (default "equal") with one `splitValues` entry
   * per person for the other modes. The math lives in lib/settle.ts.
   */
  expenses: defineTable({
    tripId: v.id("trips"),
    description: v.string(),
    amountCents: v.number(),
    paidBy: v.string(),
    splitAmong: v.array(v.string()),
    splitMode: v.optional(splitMode),
    /** Cents for "exact", whole shares for "shares", basis points for "percent". */
    splitValues: v.optional(v.array(v.number())),
    /** What it was paid in (ISO 4217). Missing on old rows, which are in the trip's currency. */
    currency: v.optional(v.string()),
    /** 1 unit of `currency` in the trip's groupCurrency, fixed when it was logged. Missing means 1. */
    rate: v.optional(v.number()),
    createdBy: v.string(),
    /** @deprecated Payments now live in `settlements`; run expenses:migrateLegacySettlements once. */
    isSettlement: v.optional(v.boolean()),
  }).index("by_tripId", ["tripId"]),

  /** Money one traveler sent another to even out the shared costs, in the trip's groupCurrency. */
  settlements: defineTable({
    tripId: v.id("trips"),
    from: v.string(),
    to: v.string(),
    amountCents: v.number(),
    createdBy: v.string(),
  }).index("by_tripId", ["tripId"]),

  /** In-app notifications, one row per recipient. */
  notifications: defineTable({
    userId: v.string(),
    tripId: v.id("trips"),
    kind: v.union(v.literal("idea"), v.literal("accepted"), v.literal("rejected"), v.literal("joined"), v.literal("expense"), v.literal("settled")),
    /** Rendered in the recipient's language when sent; the apps re-render `params` in the reader's current one. */
    text: v.string(),
    params: v.optional(
      v.object({
        name: v.optional(v.string()),
        title: v.optional(v.string()),
        item: v.optional(v.string()),
        count: v.optional(v.number()),
        amountCents: v.optional(v.number()),
        currency: v.optional(v.string()),
      }),
    ),
    isRead: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_isRead", ["userId", "isRead"])
    .index("by_tripId", ["tripId"]),

  /** One row per "Improve with AI" request, for the hourly limit. Rows older than an hour are cleared. */
  promptImprovements: defineTable({ userId: v.string(), at: v.number() }).index("by_userId_at", ["userId", "at"]),

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
    /** When "local's pick" swapped this day's tourist spots for local favorites. */
    localPickAt: v.optional(v.number()),
  }).index("by_tripId_order", ["tripId", "order"]),

  /**
   * What a day looked like before "local's pick", so the swap can be undone:
   * the activities it replaced and the ones it added. One per day while it's on.
   */
  localPickSnapshots: defineTable({
    subTripId: v.id("subTrips"),
    replaced: v.array(v.object({ ...activityFields, photoCredit: v.optional(v.string()), placeId: v.optional(v.string()), order: v.number() })),
    addedIds: v.array(v.id("activities")),
  }).index("by_subTripId", ["subTripId"]),

  /**
   * Places whose Google photo our /place-photo route may serve. Only place IDs we
   * matched ourselves are served, so the route can't be used to spend our quota.
   */
  placePhotos: defineTable({ placeId: v.string() }).index("by_placeId", ["placeId"]),

  activities: defineTable({
    subTripId: v.id("subTrips"),
    /** Denormalized so a whole trip's activities load with one index read. */
    tripId: v.id("trips"),
    /** Set on a sub-activity: the activity it belongs to. Nesting can go any depth. */
    parentId: v.optional(v.id("activities")),
    ...activityFields,
    /** Photographer of a Google Places photo, shown with it as Google requires. */
    photoCredit: v.optional(v.string()),
    /** Google Places ID (the one thing Google lets us store), for live details like rating and hours. */
    placeId: v.optional(v.string()),
    /** Set once we've searched Google for this activity, so a miss isn't searched again. */
    placeLookedUp: v.optional(v.boolean()),
    isCompleted: v.boolean(),
    completedAt: v.optional(v.number()),
    order: v.number(),
  })
    .index("by_subTripId_order", ["subTripId", "order"])
    .index("by_subTripId_parentId_order", ["subTripId", "parentId", "order"])
    .index("by_parentId", ["parentId"])
    .index("by_tripId", ["tripId"]),
});
