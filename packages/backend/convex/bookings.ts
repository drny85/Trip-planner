import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { createFormat, defaultLocale, formatTagFor, isLocale, languageInEnglish, translator, type Locale } from "@trip/i18n";
import { aiVia, generateStructured, type AiFile } from "./ai";
import { deleteAlertsFor, ensureFlightTrack } from "./alerts";
import { markFareBooked } from "./fares";
import { getMemberTrip, getOptionalUserId, findMembership, getOwnedTrip } from "./lib/auth";
import {
  type Booking,
  bookingObject,
  bookingSummary,
  CATEGORY_FOR,
  durationOf,
  extractedBookingsSchema,
  IMPORT_FILE_TYPES,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_TEXT,
  normalizeBooking,
  placeBooking,
  placementObject,
  type PlanDay,
} from "./lib/bookings";
import { nextTier, type Tier } from "./lib/modelRouter";
import { photoFor } from "./lib/photos";
import { newToken } from "./lib/tokens";

/**
 * Booking import. A traveler pastes a confirmation email, uploads a PDF or a
 * screenshot, or forwards the email to the trip's own address (see http.ts).
 * AI reads it in the background, the bookings it found wait for review, and
 * "Add to trip" files each one into the right day: onto an activity already
 * planned for it (the hotel check-in, the dinner) or as a new stop.
 *
 * Upload flow for files: `memories.generateUploadUrl` -> POST the file -> `start`.
 */

const EXTRACT_PROMPT = `You read travel confirmation emails, PDFs and screenshots and pull out the bookings in them: flights, trains, buses, ferries, car rentals, hotels and other stays, restaurant reservations, tours and event tickets.

- Copy confirmation codes, times, addresses and phone numbers exactly as written. Never guess or invent one: leave a field out if it isn't there.
- Dates and times are local to where the booking happens (a flight's departure time is local to the departure airport).
- A round trip or a multi-leg flight is one booking per leg. A hotel stay is one booking from check-in to check-out.
- Give the total price and its currency only when the confirmation states what was paid or is due.
- Ignore ads, loyalty offers and anything that isn't a reservation.
- When a booking is clearly for an activity already in the itinerary below (same hotel, restaurant or tour), give its id as matchActivityId.
- If there are no bookings at all, return an empty list.`;

const toLocale = (language?: string): Locale => (isLocale(language) ? language : defaultLocale);
const languageRule = (locale: Locale) =>
  `\n- Write titles and details in ${languageInEnglish[locale]}. Keep names, confirmation codes, flight numbers, addresses and phone numbers exactly as written.`;

/** Starts reading a pasted confirmation or an uploaded file. Returns the import's id. */
export const start = mutation({
  args: {
    tripId: v.id("trips"),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    /** App language ("es", "ja", …): titles and messages are written in it. */
    language: v.optional(v.string()),
  },
  handler: async (ctx, { tripId, text, storageId, fileName, language }) => {
    const { userId } = await getMemberTrip(ctx, tripId);
    const locale = toLocale(language);
    const t = translator(locale);
    const body = text?.trim().slice(0, MAX_IMPORT_TEXT);
    if (storageId) {
      const file = await ctx.db.system.get("_storage", storageId);
      if (!file) throw new Error("Upload not found");
      const supported = (IMPORT_FILE_TYPES as readonly string[]).includes(file.contentType ?? "");
      if (!supported || file.size > MAX_IMPORT_BYTES) {
        // Not thrown: a throw would roll back the delete and leave the file behind.
        await ctx.storage.delete(storageId);
        return ctx.db.insert("bookingImports", {
          tripId,
          userId,
          source: "file",
          fileName: fileName?.slice(0, 120),
          language: locale,
          status: "failed",
          error: t("bookings.errFileType"),
        });
      }
    } else if (!body || body.length < 20) {
      throw new Error(t("bookings.errPasteOrUpload"));
    }
    return createImport(ctx, {
      tripId,
      userId,
      source: storageId ? "file" : "text",
      text: body || undefined,
      storageId,
      fileName: fileName?.slice(0, 120),
      language: locale,
    });
  },
});

async function createImport(ctx: MutationCtx, fields: Omit<Doc<"bookingImports">, "_id" | "_creationTime" | "status">) {
  const importId = await ctx.db.insert("bookingImports", { ...fields, status: "processing" });
  await ctx.scheduler.runAfter(0, internal.bookings.extract, { importId });
  return importId;
}

type ImportJob = {
  language?: string;
  text?: string;
  storageId?: Id<"_storage">;
  contentType?: string;
  fileName?: string;
  trip: { title: string; destination: string; startDate: string; endDate: string };
  days: (PlanDay & { location?: string })[];
};

/** Everything the model needs: the confirmation plus the trip's days, for placing bookings. */
export const importContext = internalQuery({
  args: { importId: v.id("bookingImports") },
  handler: async (ctx, { importId }): Promise<ImportJob | null> => {
    const row = await ctx.db.get("bookingImports", importId);
    if (!row || row.status !== "processing") return null;
    const trip = await ctx.db.get("trips", row.tripId);
    if (!trip) return null;
    const [subTrips, activities] = await Promise.all([
      ctx.db.query("subTrips").withIndex("by_tripId_order", (q) => q.eq("tripId", trip._id)).collect(),
      ctx.db.query("activities").withIndex("by_tripId", (q) => q.eq("tripId", trip._id)).collect(),
    ]);
    const file = row.storageId ? await ctx.db.system.get("_storage", row.storageId) : null;
    const days: ImportJob["days"] = subTrips.map((s) => ({
      subTripId: s._id,
      dayNumber: s.dayNumber,
      date: s.date,
      location: s.location,
      activities: activities
        .filter((a) => a.subTripId === s._id && !a.parentId)
        .sort((a, b) => a.order - b.order)
        .map((a) => ({ id: a._id, title: a.title, category: a.category, startTime: a.startTime })),
    }));
    return {
      language: row.language,
      text: row.text,
      storageId: row.storageId,
      contentType: file?.contentType,
      fileName: row.fileName,
      trip: { title: trip.title, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate },
      days,
    };
  },
});

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** Reads one import with AI, starting on the cheap tier and stepping up if the answer is incomplete. */
export const extract = internalAction({
  args: { importId: v.id("bookingImports") },
  handler: async (ctx, { importId }): Promise<null> => {
    const fail = (error: string): Promise<null> => ctx.runMutation(internal.bookings.finishExtract, { importId, error });
    let t = translator(defaultLocale);
    try {
      const job: ImportJob | null = await ctx.runQuery(internal.bookings.importContext, { importId });
      if (!job) return null;
      const locale = toLocale(job.language);
      t = translator(locale);
      const via = aiVia();
      if (!via) return await fail("AI is not set up: add AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY to the Convex deployment");

      let file: AiFile | undefined;
      if (job.storageId) {
        const blob = await ctx.storage.get(job.storageId);
        if (!blob) return await fail(t("bookings.errFileGone"));
        file = { data: toBase64(new Uint8Array(await blob.arrayBuffer())), mediaType: job.contentType ?? blob.type, filename: job.fileName };
      }

      const itinerary = job.days.map((d) => ({
        day: d.dayNumber,
        date: d.date,
        location: d.location,
        activities: d.activities.map(({ id, title, category, startTime }) => ({ id, title, category, startTime })),
      }));
      const content = [
        `Trip: ${job.trip.title} in ${job.trip.destination}, ${job.trip.startDate} to ${job.trip.endDate}.`,
        `Itinerary (JSON): ${JSON.stringify(itinerary)}`,
        job.text ? `Confirmation:\n"""\n${job.text}\n"""` : "The confirmation is the attached file.",
      ].join("\n\n");

      let tier: Tier | null = "simple";
      while (tier) {
        const result = await generateStructured(via, tier, content, { system: EXTRACT_PROMPT + languageRule(locale), schema: extractedBookingsSchema }, file);
        if (result.refused) return await fail(t("bookings.errRefused"));
        if (result.trip && !result.truncated) {
          const proposals = result.trip.bookings.slice(0, 20).map((raw) => {
            const { matchActivityId, ...booking } = normalizeBooking(raw);
            const placement = placeBooking({ ...booking, matchActivityId }, job.days, job.trip);
            return { booking, placement: placement as { subTripId?: Id<"subTrips">; activityId?: Id<"activities">; outsideTrip?: boolean } };
          });
          if (proposals.length === 0) return await fail(t("bookings.errNoBookings"));
          return await ctx.runMutation(internal.bookings.finishExtract, { importId, proposals, aiModel: result.model });
        }
        tier = process.env.AI_MODEL ? null : nextTier(tier);
      }
      return await fail(t("bookings.errIncomplete"));
    } catch (error) {
      console.error("Booking import failed", error);
      return await fail(t("bookings.errGeneric"));
    }
  },
});

export const finishExtract = internalMutation({
  args: {
    importId: v.id("bookingImports"),
    proposals: v.optional(v.array(v.object({ booking: bookingObject, placement: placementObject }))),
    aiModel: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { importId, proposals, aiModel, error }) => {
    const row = await ctx.db.get("bookingImports", importId);
    if (!row || row.status !== "processing") return null;
    // The file has been read; it isn't kept.
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.patch("bookingImports", importId, {
      storageId: undefined,
      ...(error ? { status: "failed" as const, error } : { status: "ready" as const, proposals, aiModel }),
    });
    return null;
  },
});

/** The trip's bookings (everyone on the trip sees them) and the caller's pending imports. */
export const forTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const userId = await getOptionalUserId(ctx);
    const trip = await ctx.db.get("trips", tripId);
    const member = trip && userId ? await findMembership(ctx, trip, userId) : null;
    if (!trip || !member || !userId) return null;
    const [bookings, imports] = await Promise.all([
      ctx.db.query("bookings").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("bookingImports").withIndex("by_tripId_userId", (q) => q.eq("tripId", tripId).eq("userId", userId)).order("desc").collect(),
    ]);
    const domain = process.env.INBOUND_EMAIL_DOMAIN;
    const isOwner = member.role === "owner";
    return {
      bookings: bookings.sort((a, b) => `${a.startDate ?? "9"}${a.startTime ?? ""}`.localeCompare(`${b.startDate ?? "9"}${b.startTime ?? ""}`)),
      imports: imports
        .filter((i) => i.status === "processing" || i.status === "ready" || i.status === "failed")
        .map(({ text: _text, storageId: _file, ...i }) => i),
      email: {
        /** Forwarding needs an inbound email provider pointed at http.ts (see README). */
        available: Boolean(domain),
        canManage: isOwner,
        address: domain && isOwner && trip.importToken ? `trip-${trip.importToken}@${domain}` : undefined,
      },
    };
  },
});

/** Turns on the trip's forwarding address (owner only) and returns it. */
export const enableEmail = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await getOwnedTrip(ctx, tripId);
    const domain = process.env.INBOUND_EMAIL_DOMAIN;
    if (!domain) throw new Error(translator(defaultLocale)("bookings.errEmailOff"));
    const importToken = trip.importToken ?? newToken();
    if (!trip.importToken) await ctx.db.patch("trips", tripId, { importToken });
    return `trip-${importToken}@${domain}`;
  },
});

/** Turns the forwarding address off; mail sent to it is ignored from then on. */
export const disableEmail = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await getOwnedTrip(ctx, tripId);
    await ctx.db.patch("trips", tripId, { importToken: undefined });
  },
});

/** A forwarded email, from http.ts. It's filed under the trip owner, who reviews it in the app. */
export const receiveEmail = internalMutation({
  args: {
    token: v.string(),
    text: v.optional(v.string()),
    subject: v.optional(v.string()),
    from: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, { token, text, subject, from, storageId, fileName }) => {
    const trip = token.length >= 16 ? await ctx.db.query("trips").withIndex("by_importToken", (q) => q.eq("importToken", token)).unique() : null;
    if (!trip) {
      if (storageId) await ctx.storage.delete(storageId);
      return null;
    }
    // A flood of mail to one address shouldn't run up the AI bill.
    const pending = await ctx.db.query("bookingImports").withIndex("by_tripId", (q) => q.eq("tripId", trip._id)).collect();
    if (pending.filter((i) => i.status === "processing" || i.status === "ready").length >= 30) {
      if (storageId) await ctx.storage.delete(storageId);
      return null;
    }
    const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", trip.userId)).unique();
    const body = [subject && `Subject: ${subject}`, text].filter(Boolean).join("\n\n").slice(0, MAX_IMPORT_TEXT);
    if (!storageId && body.length < 20) return null;
    return createImport(ctx, {
      tripId: trip._id,
      userId: trip.userId,
      source: "email",
      text: body || undefined,
      storageId,
      fileName: fileName?.slice(0, 120),
      subject: subject?.slice(0, 200),
      from: from?.slice(0, 200),
      language: owner?.language,
    });
  },
});

async function myImport(ctx: MutationCtx, importId: Id<"bookingImports">) {
  const row = await ctx.db.get("bookingImports", importId);
  if (!row) throw new Error("Import not found");
  const { trip, userId } = await getMemberTrip(ctx, row.tripId);
  if (row.userId !== userId) throw new Error("Import not found");
  return { row, trip, userId };
}

/** Drops an import without adding anything. */
export const dismiss = mutation({
  args: { importId: v.id("bookingImports") },
  handler: async (ctx, { importId }) => {
    const { row } = await myImport(ctx, importId);
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.patch("bookingImports", importId, { status: "dismissed", text: undefined, storageId: undefined });
  },
});

/**
 * Adds the chosen bookings to the itinerary. Each item names a proposal by its
 * index and where it goes: onto `activityId`, or as a new stop on `subTripId`
 * placed by its start time. Proposals left out are skipped.
 */
export const apply = mutation({
  args: {
    importId: v.id("bookingImports"),
    items: v.array(v.object({ index: v.number(), subTripId: v.id("subTrips"), activityId: v.optional(v.id("activities")) })),
  },
  handler: async (ctx, { importId, items }) => {
    const { row, trip, userId } = await myImport(ctx, importId);
    const locale = toLocale(row.language);
    if (row.status !== "ready" || !row.proposals) throw new Error(translator(locale)("bookings.errHandled"));
    const text = { t: translator(locale), f: createFormat(locale, formatTagFor(locale)) };
    const seen = new Set<number>();
    const added: Id<"activities">[] = [];
    for (const item of items) {
      const proposal = row.proposals[item.index];
      if (!proposal || seen.has(item.index)) continue;
      seen.add(item.index);
      const day = await ctx.db.get("subTrips", item.subTripId);
      if (!day || day.tripId !== trip._id) throw new Error("Day not found");
      const target = item.activityId ? await ctx.db.get("activities", item.activityId) : null;
      const activityId =
        target && target.tripId === trip._id
          ? await attachTo(ctx, target, proposal.booking)
          : await insertActivity(ctx, day, proposal.booking, bookingSummary(proposal.booking, text.t, text.f));
      const bookingId = await ctx.db.insert("bookings", { tripId: trip._id, activityId, importId, addedBy: userId, ...proposal.booking });
      // Flights with a flight number get delay and gate alerts by themselves.
      const saved = await ctx.db.get("bookings", bookingId);
      if (saved?.kind === "flight") {
        await ensureFlightTrack(ctx, saved);
        // They booked: their fare watch is done, live tracking takes over.
        await markFareBooked(ctx, trip._id, userId);
      }
      added.push(activityId);
    }
    await ctx.db.patch("bookingImports", importId, { status: "applied", text: undefined });
    return added;
  },
});

/** Fills in an activity already planned for the booking. The booking's time wins; existing details stay. */
async function attachTo(ctx: MutationCtx, activity: Doc<"activities">, b: Booking) {
  const duration = durationOf(b);
  await ctx.db.patch("activities", activity._id, {
    startTime: b.startTime ?? activity.startTime,
    durationMinutes: duration ?? activity.durationMinutes,
    address: activity.address || b.address || "",
    phone: activity.phone ?? b.phone,
    bookingUrl: b.bookingUrl ?? activity.bookingUrl,
  });
  return activity._id;
}

/** A new top-level stop on the day, slotted in by start time. */
async function insertActivity(ctx: MutationCtx, day: Doc<"subTrips">, b: Booking, description: string) {
  const { category, subcategory } = CATEGORY_FOR[b.kind];
  const siblings = await ctx.db
    .query("activities")
    .withIndex("by_subTripId_parentId_order", (q) => q.eq("subTripId", day._id).eq("parentId", undefined))
    .collect();
  const at = b.startTime ? siblings.findIndex((a) => a.startTime && a.startTime > b.startTime!) : -1;
  const order = at === -1 ? siblings.length : at;
  // Make room: everything from the slot on moves down one.
  await Promise.all(siblings.slice(order).map((a, i) => ctx.db.patch("activities", a._id, { order: order + i + 1 })));
  return ctx.db.insert("activities", {
    tripId: day.tripId,
    subTripId: day._id,
    title: b.title,
    description,
    address: b.address ?? "",
    phone: b.phone,
    bookingUrl: b.bookingUrl,
    category,
    subcategory,
    startTime: b.startTime,
    durationMinutes: durationOf(b),
    photoUrl: photoFor(category, `${day.location ?? ""}-${b.title}`, 1000),
    isCompleted: false,
    order,
  });
}

/** Removes a saved booking. The activity it was filed under stays. */
export const remove = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const booking = await ctx.db.get("bookings", bookingId);
    if (!booking) return;
    const { trip, userId } = await getMemberTrip(ctx, booking.tripId);
    if (booking.addedBy !== userId && trip.userId !== userId) throw new Error("Only the person who added it or the organizer can remove it");
    await deleteAlertsFor(ctx, bookingId);
    await ctx.db.delete("bookings", bookingId);
  },
});

/** Deletes a trip's bookings and imports; called from trips.remove. */
export async function deleteTripBookings(ctx: MutationCtx, tripId: Id<"trips">) {
  const [bookings, imports] = await Promise.all([
    ctx.db.query("bookings").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
    ctx.db.query("bookingImports").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).collect(),
  ]);
  for (const b of bookings) await deleteAlertsFor(ctx, b._id);
  await Promise.all([
    ...bookings.map((b) => ctx.db.delete("bookings", b._id)),
    ...imports.map((i) => ctx.db.delete("bookingImports", i._id)),
    ...imports.flatMap((i) => (i.storageId ? [ctx.storage.delete(i.storageId)] : [])),
  ]);
}
