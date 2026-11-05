import { v, type Infer } from "convex/values";
import { z } from "zod";
import type { Category } from "./categories";
import { decodeEntities } from "./text";

/**
 * Booking import: the model reads a confirmation (pasted email, forwarded email,
 * PDF or screenshot) and returns the bookings in it. Everything here is pure so
 * it can be tested without a model or a database.
 */

export const BOOKING_KINDS = ["flight", "train", "bus", "ferry", "car", "hotel", "restaurant", "tour", "event", "other"] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

const [k1, k2, ...kRest] = BOOKING_KINDS.map((k) => v.literal(k));
export const bookingKind = v.union(k1!, k2!, ...kRest);

/** One booking as stored on an import (a proposal) and, once applied, in `bookings`. */
export const bookingFields = {
  kind: bookingKind,
  /** What shows on the itinerary, e.g. "Flight UA 837 · SFO → NRT". */
  title: v.string(),
  /** Airline, hotel, restaurant or tour operator. */
  provider: v.optional(v.string()),
  confirmationCode: v.optional(v.string()),
  /** Local date and time where it starts: "YYYY-MM-DD" and "HH:mm". */
  startDate: v.optional(v.string()),
  startTime: v.optional(v.string()),
  /** Check-out, landing or drop-off. */
  endDate: v.optional(v.string()),
  endTime: v.optional(v.string()),
  address: v.optional(v.string()),
  phone: v.optional(v.string()),
  /** "Manage booking" page. */
  bookingUrl: v.optional(v.string()),
  /** Short extras: seat, terminal, room type, party size. */
  details: v.optional(v.string()),
};
export const bookingObject = v.object(bookingFields);
export type Booking = Infer<typeof bookingObject>;

/** Where a proposed booking goes: a day, and optionally an activity already planned for it. */
export const placementObject = v.object({
  subTripId: v.optional(v.id("subTrips")),
  activityId: v.optional(v.id("activities")),
  /** The booking's date falls outside the trip, so it was put on the nearest day. */
  outsideTrip: v.optional(v.boolean()),
});

const isoDate = z.string().describe("ISO date, YYYY-MM-DD, local to where it happens");
const time = z.string().describe("Local time, HH:mm 24h");

export const extractedBookingsSchema = z.object({
  bookings: z
    .array(
      z.object({
        kind: z.string().describe(`One of: ${BOOKING_KINDS.join(", ")}`),
        title: z.string().describe('Short itinerary title, e.g. "Flight UA 837 · SFO → NRT", "Check in · Park Hyatt Tokyo", "Dinner at Sukiyabashi Jiro"'),
        provider: z.string().optional().describe("Airline, hotel, restaurant, rental company or tour operator"),
        confirmationCode: z.string().optional().describe("Booking reference / confirmation number / PNR, exactly as written"),
        startDate: isoDate.optional().describe("Departure, check-in or reservation date"),
        startTime: time.optional().describe("Departure, check-in or reservation time, local"),
        endDate: isoDate.optional().describe("Arrival, check-out or drop-off date"),
        endTime: time.optional().describe("Arrival, check-out or drop-off time, local"),
        address: z.string().optional().describe("Street address, or the departure airport / station name and city"),
        phone: z.string().optional().describe("Phone number exactly as written in the confirmation"),
        bookingUrl: z.string().optional().describe("Link to view or manage the booking, only if it appears in the confirmation"),
        details: z.string().optional().describe("Short extras on one line: seat, terminal, gate, room type, guests, party size"),
        matchActivityId: z.string().optional().describe("Id of the existing itinerary activity this booking is for, if one clearly is"),
      }),
    )
    .describe("Every separate booking in the confirmation. A round-trip flight is two bookings. Empty if there are none."),
});
export type ExtractedBookings = z.infer<typeof extractedBookingsSchema>;
type Extracted = ExtractedBookings["bookings"][number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const clean = (s?: string, max = 200) => {
  const t = decodeEntities(s)?.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
};
const date = (s?: string) => (s && ISO_DATE.test(s.trim()) ? s.trim() : undefined);
const hhmm = (s?: string) => {
  const m = s?.trim().match(HHMM);
  if (m) return `${m[1]!.padStart(2, "0")}:${m[2]}`;
  // Models sometimes copy "3pm" or "3:30 PM" straight from the email.
  const ampm = s?.trim().match(/^(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?$/i);
  if (!ampm || Number(ampm[1]) < 1 || Number(ampm[1]) > 12) return undefined;
  const hour = (Number(ampm[1]) % 12) + (ampm[3]!.toLowerCase() === "p" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${ampm[2] ?? "00"}`;
};
const url = (s?: string) => (s && /^https?:\/\//i.test(s.trim()) ? s.trim().slice(0, 2000) : undefined);

const toKind = (value: string): BookingKind => {
  const k = value.trim().toLowerCase();
  if ((BOOKING_KINDS as readonly string[]).includes(k)) return k as BookingKind;
  if (/hotel|lodging|stay|airbnb|hostel|accommodation/.test(k)) return "hotel";
  if (/restaurant|dining|dinner|lunch|table/.test(k)) return "restaurant";
  if (/rental|car/.test(k)) return "car";
  if (/rail|train/.test(k)) return "train";
  if (/tour|activity|experience|excursion/.test(k)) return "tour";
  if (/ticket|concert|show|event/.test(k)) return "event";
  return "other";
};

/** Cleans one model answer: drops bad dates, times and links instead of rejecting it. */
export function normalizeBooking(b: Extracted): Booking & { matchActivityId?: string } {
  return {
    kind: toKind(b.kind),
    title: clean(b.title, 120) || "Booking",
    provider: clean(b.provider, 120),
    confirmationCode: clean(b.confirmationCode, 60),
    startDate: date(b.startDate),
    startTime: hhmm(b.startTime),
    endDate: date(b.endDate),
    endTime: hhmm(b.endTime),
    address: clean(b.address, 300),
    phone: clean(b.phone, 40),
    bookingUrl: url(b.bookingUrl),
    details: clean(b.details, 300),
    matchActivityId: b.matchActivityId?.trim() || undefined,
  };
}

/** The itinerary category a booking becomes. */
export const CATEGORY_FOR: Record<BookingKind, { category: Category; subcategory?: string }> = {
  flight: { category: "transport", subcategory: "flight" },
  train: { category: "transport", subcategory: "train" },
  bus: { category: "transport", subcategory: "bus" },
  ferry: { category: "transport", subcategory: "ferry" },
  car: { category: "transport", subcategory: "car" },
  hotel: { category: "lodging", subcategory: "hotel" },
  restaurant: { category: "food" },
  tour: { category: "sightseeing", subcategory: "tour" },
  event: { category: "nightlife", subcategory: "show" },
  other: { category: "other" },
};

export type PlanDay = {
  subTripId: string;
  dayNumber: number;
  date?: string;
  activities: { id: string; title: string; category?: string; startTime?: string }[];
};

const STOP = new Set(["the", "and", "at", "in", "of", "to", "for", "with", "check", "visit", "dinner", "lunch", "breakfast", "flight", "hotel", "tour", "day"]);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );

/**
 * Picks the day (by date, else the nearest day) and, when the booking is clearly
 * for something already planned that day, that activity.
 */
export function placeBooking(b: Booking & { matchActivityId?: string }, days: PlanDay[], trip?: { startDate: string; endDate: string }) {
  if (days.length === 0) return {};
  // The model's match wins when it names a real activity.
  if (b.matchActivityId) {
    const day = days.find((d) => d.activities.some((a) => a.id === b.matchActivityId));
    if (day) return { subTripId: day.subTripId, activityId: b.matchActivityId };
  }

  let day = days[0]!;
  const dated = days.filter((d) => d.date);
  if (b.startDate && dated.length) {
    // Legs can span several days: the last day or leg starting on or before the date, else the first.
    const before = dated.filter((d) => d.date! <= b.startDate!);
    day = before.length ? before[before.length - 1]! : dated[0]!;
  }
  const outsideTrip = Boolean(b.startDate && trip && (b.startDate < trip.startDate || b.startDate > trip.endDate));

  // A same-category activity that shares a distinctive word ("Park Hyatt") with the booking.
  const target = CATEGORY_FOR[b.kind].category;
  const mine = words(`${b.title} ${b.provider ?? ""}`);
  const match = day.activities.find((a) => (a.category ?? "other") === target && [...words(a.title)].some((w) => mine.has(w)));
  return { subTripId: day.subTripId, activityId: match?.id, outsideTrip: outsideTrip || undefined };
}

/** Minutes between start and end, when both are on the same day. */
export function durationOf(b: Booking): number | undefined {
  if (!b.startTime || !b.endTime) return undefined;
  if (b.endDate && b.startDate && b.endDate !== b.startDate) return undefined;
  const [sh, sm] = b.startTime.split(":").map(Number);
  const [eh, em] = b.endTime.split(":").map(Number);
  const minutes = eh! * 60 + em! - (sh! * 60 + sm!);
  return minutes > 0 ? minutes : undefined;
}

/** One line for the activity description, e.g. "Confirmation ABC123 · Seat 32A · Check out May 9, 11:00". */
export function bookingSummary(b: Booking): string {
  const parts = [b.provider, b.confirmationCode && `Confirmation ${b.confirmationCode}`, b.details];
  if (b.kind === "hotel" && b.endDate) parts.push(`Check out ${b.endDate}${b.endTime ? ` ${b.endTime}` : ""}`);
  else if (b.endTime && b.kind !== "restaurant") parts.push(`Until ${b.endDate && b.endDate !== b.startDate ? `${b.endDate} ` : ""}${b.endTime}`);
  return parts.filter(Boolean).join(" · ");
}

/** Plain text from an email's HTML body, good enough for the model to read. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
      .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export const IMPORT_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_TEXT = 60_000;
