/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { generateText } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateText: vi.fn<(opts: any) => Promise<any>>(),
}));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText }));
import { api } from "./_generated/api";
import { parseInboundEmail, tokenFrom } from "./http";
import { htmlToText, normalizeBooking, placeBooking, type ExtractedBookings } from "./lib/bookings";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const extracted: ExtractedBookings = {
  bookings: [
    {
      kind: "Flight",
      title: "Flight JL 61 · LAX → HND",
      provider: "Japan Airlines",
      confirmationCode: "K7Q2PX",
      startDate: "2027-04-01",
      startTime: "11:50",
      endDate: "2027-04-02",
      endTime: "15:55",
      address: "Los Angeles International Airport (LAX)",
      details: "Seat 34A",
      bookingUrl: "javascript:alert(1)",
    },
    {
      kind: "hotel",
      title: "Check in · Gion machiya",
      provider: "Gion Machiya Stay",
      confirmationCode: "HB-99812",
      startDate: "2027-04-05",
      startTime: "3pm",
      endDate: "2027-04-07",
      endTime: "11:00",
      phone: "+81 75-000-0000",
    },
    {
      kind: "restaurant",
      title: "Dinner at Sushi Saito",
      confirmationCode: "OT-5531",
      startDate: "2027-04-03",
      startTime: "19:30",
      address: "1-4-5 Roppongi, Minato City, Tokyo",
    },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  for (const name of ["ANTHROPIC_API_KEY", "AI_MODEL", "AI_MODEL_SIMPLE", "AI_MODEL_STANDARD", "AI_MODEL_COMPLEX", "INBOUND_EMAIL_DOMAIN"]) vi.stubEnv(name, "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
  // Wikipedia photo lookups for the demo trip find nothing.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  generateText.mockReset();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ana = t.withIdentity({ subject: "ana", name: "Ana" });
  const tripId = await ana.mutation(api.seed.demoTrip, {});
  return { t, ana, tripId };
}

test("a pasted confirmation is read in the background and filed into the right days", async () => {
  const { t, ana, tripId } = await setup();
  generateText.mockResolvedValueOnce({ output: extracted, finishReason: "stop", response: { modelId: "google/gemini-3.5-flash" } });

  const importId = await ana.mutation(api.bookings.start, { tripId, text: "Your Japan Airlines booking K7Q2PX is confirmed. Flight JL 61..." });
  expect((await ana.query(api.bookings.forTrip, { tripId }))!.imports[0]).toMatchObject({ _id: importId, status: "processing" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  // Extraction starts on the cheap tier and sends the itinerary so the model can match activities.
  const call = generateText.mock.calls[0]![0];
  expect(call.model).toBe("google/gemini-3.5-flash");
  expect(call.prompt).toContain("Your Japan Airlines booking");
  expect(call.prompt).toContain("Stay in a Gion machiya");

  const trip = (await ana.query(api.trips.get, { tripId }))!;
  const [day1, , day3, kyoto] = trip.subTrips;
  const machiya = kyoto!.activities.find((a) => a.title === "Stay in a Gion machiya")!;

  const ready = (await ana.query(api.bookings.forTrip, { tripId }))!.imports[0]!;
  expect(ready.status).toBe("ready");
  const [flight, hotel, dinner] = ready.proposals!;
  // Flight lands before the trip's first day: nearest day, flagged.
  expect(flight).toMatchObject({ booking: { kind: "flight", startTime: "11:50" }, placement: { subTripId: day1!._id, outsideTrip: true } });
  expect(flight!.booking.bookingUrl).toBeUndefined();
  // The hotel is the stay already planned in Kyoto; "3pm" becomes 15:00.
  expect(hotel).toMatchObject({ booking: { kind: "hotel", startTime: "15:00" }, placement: { subTripId: kyoto!._id, activityId: machiya._id } });
  expect(dinner!.placement).toMatchObject({ subTripId: trip.subTrips[1]!._id });
  expect(dinner!.placement.activityId).toBeUndefined();

  // Add all three; move the flight to day 3 to check the traveler's choice wins.
  await ana.mutation(api.bookings.apply, {
    importId,
    items: [
      { index: 0, subTripId: day3!._id },
      { index: 1, subTripId: kyoto!._id, activityId: machiya._id },
      { index: 2, subTripId: dinner!.placement.subTripId! },
    ],
  });

  const after = (await ana.query(api.trips.get, { tripId }))!;
  const day2 = after.subTrips[1]!.activities;
  const sushi = day2.find((a) => a.title === "Dinner at Sushi Saito")!;
  expect(sushi).toMatchObject({ category: "food", startTime: "19:30", description: "Confirmation OT-5531" });
  // Slotted in by time: after everything that starts earlier.
  const times = day2.map((a) => a.startTime ?? "");
  expect(times).toEqual([...times].sort());
  expect(after.subTrips[3]!.activities.find((a) => a._id === machiya._id)).toMatchObject({ phone: "+81 75-000-0000", title: "Stay in a Gion machiya" });
  const flightStop = after.subTrips[2]!.activities.find((a) => a.title.startsWith("Flight JL 61"))!;
  expect(flightStop).toMatchObject({ category: "transport", subcategory: "flight" });
  expect(flightStop.description).toContain("Confirmation K7Q2PX");

  const { bookings, imports } = (await ana.query(api.bookings.forTrip, { tripId }))!;
  expect(bookings.map((b) => b.confirmationCode)).toEqual(["K7Q2PX", "OT-5531", "HB-99812"]);
  expect(imports).toHaveLength(0);
  await expect(ana.mutation(api.bookings.apply, { importId, items: [] })).rejects.toThrow("already handled");
});

test("an uploaded PDF goes to the model as a file and is deleted once read", async () => {
  const { t, ana, tripId } = await setup();
  generateText.mockResolvedValueOnce({ output: { bookings: [extracted.bookings[2]!] }, finishReason: "stop", response: { modelId: "x" } });
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1.7 fake"], { type: "application/pdf" })));

  await ana.mutation(api.bookings.start, { tripId, storageId, fileName: "booking.pdf" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const part = generateText.mock.calls[0]![0].messages[0].content[0];
  expect(part).toMatchObject({ type: "file", mediaType: "application/pdf", filename: "booking.pdf", data: { type: "data" } });
  expect(atob(part.data.data)).toBe("%PDF-1.7 fake");
  expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
});

test("an answer with no bookings fails with a clear message, and others can't see or apply it", async () => {
  const { t, ana, tripId } = await setup();
  generateText.mockResolvedValueOnce({ output: { bookings: [] }, finishReason: "stop", response: { modelId: "x" } });
  const importId = await ana.mutation(api.bookings.start, { tripId, text: "Thanks for subscribing to our newsletter!" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await ana.query(api.bookings.forTrip, { tripId }))!.imports[0]).toMatchObject({ status: "failed", error: "No bookings found in that confirmation." });

  const ben = t.withIdentity({ subject: "ben" });
  expect(await ben.query(api.bookings.forTrip, { tripId })).toBeNull();
  await expect(ben.mutation(api.bookings.dismiss, { importId })).rejects.toThrow();
  await ana.mutation(api.bookings.dismiss, { importId });
  expect((await ana.query(api.bookings.forTrip, { tripId }))!.imports).toHaveLength(0);
});

test("titles and messages follow the app language", async () => {
  const { t, ana, tripId } = await setup();
  generateText.mockResolvedValueOnce({ output: { bookings: [] }, finishReason: "stop", response: { modelId: "x" } });
  await ana.mutation(api.bookings.start, { tripId, text: "Gracias por suscribirte a nuestro boletín.", language: "es" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(generateText.mock.calls[0]![0].system).toContain("in Spanish");
  expect((await ana.query(api.bookings.forTrip, { tripId }))!.imports[0]!.error).toBe("No se encontraron reservas en esa confirmación.");
});

test("files that aren't PDFs or images fail and are deleted", async () => {
  const { t, ana, tripId } = await setup();
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"], { type: "application/zip" })));
  await ana.mutation(api.bookings.start, { tripId, storageId });
  expect((await ana.query(api.bookings.forTrip, { tripId }))!.imports[0]).toMatchObject({ status: "failed", error: expect.stringContaining("PDF or an image") });
  expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  await expect(ana.mutation(api.bookings.start, { tripId, text: "hi" })).rejects.toThrow("Paste the confirmation");
});

test("forwarded email reaches the trip through its address, and only with the secret", async () => {
  vi.stubEnv("INBOUND_EMAIL_DOMAIN", "in.example.com");
  vi.stubEnv("INBOUND_EMAIL_SECRET", "s3cret");
  const { t, ana, tripId } = await setup();
  const address = await ana.mutation(api.bookings.enableEmail, { tripId });
  expect(address).toMatch(/^trip-[0-9a-f]{32}@in\.example\.com$/);
  expect((await ana.query(api.bookings.forTrip, { tripId }))!.email).toMatchObject({ available: true, canManage: true, address });

  generateText.mockResolvedValue({ output: { bookings: [extracted.bookings[2]!] }, finishReason: "stop", response: { modelId: "x" } });
  const payload = {
    From: "OpenTable <no-reply@opentable.com>",
    ToFull: [{ Email: address.toUpperCase() }],
    Subject: "Your reservation at Sushi Saito",
    HtmlBody: "<p>Reservation <b>OT-5531</b> confirmed for 2 people.</p><style>p{}</style>",
    Attachments: [],
  };
  const denied = await t.fetch("/inbound/email?key=wrong", { method: "POST", body: JSON.stringify(payload) });
  expect(denied.status).toBe(401);
  const ok = await t.fetch("/inbound/email?key=s3cret", { method: "POST", body: JSON.stringify(payload) });
  expect(ok.status).toBe(200);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(generateText.mock.calls[0]![0].prompt).toContain("Subject: Your reservation at Sushi Saito\n\nReservation OT-5531 confirmed for 2 people.");
  const [imp] = (await ana.query(api.bookings.forTrip, { tripId }))!.imports;
  expect(imp).toMatchObject({ source: "email", status: "ready", from: "OpenTable <no-reply@opentable.com>" });

  // Once turned off, mail to the old address is dropped.
  await ana.mutation(api.bookings.disableEmail, { tripId });
  await t.fetch("/inbound/email?key=s3cret", { method: "POST", body: JSON.stringify(payload) });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(generateText).toHaveBeenCalledTimes(1);
});

test("deleting a trip deletes its bookings and imports", async () => {
  const { t, ana, tripId } = await setup();
  generateText.mockResolvedValueOnce({ output: extracted, finishReason: "stop", response: { modelId: "x" } });
  await ana.mutation(api.bookings.start, { tripId, text: "Booking confirmation K7Q2PX for your flight" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await ana.mutation(api.trips.remove, { tripId });
  expect(await t.run((ctx) => ctx.db.query("bookingImports").collect())).toHaveLength(0);
});

describe("pure helpers", () => {
  const days = [
    { subTripId: "d1", dayNumber: 1, date: "2027-04-02", activities: [{ id: "a1", title: "Hotel Gracery check-in", category: "lodging" }] },
    { subTripId: "d2", dayNumber: 2, date: "2027-04-03", activities: [] },
    { subTripId: "leg", dayNumber: 4, date: "2027-04-05", activities: [{ id: "a2", title: "Kaiseki dinner", category: "food" }] },
  ];
  const trip = { startDate: "2027-04-02", endDate: "2027-04-06" };
  const b = (over: Partial<ExtractedBookings["bookings"][number]>) => normalizeBooking({ kind: "other", title: "x", ...over });

  test("placeBooking uses the date, legs and the model's match", () => {
    expect(placeBooking(b({ kind: "hotel", title: "Check in · Hotel Gracery Shinjuku", startDate: "2027-04-02" }), days, trip)).toEqual({ subTripId: "d1", activityId: "a1" });
    // Day 5 is inside the Kyoto leg.
    expect(placeBooking(b({ startDate: "2027-04-06" }), days, trip)).toEqual({ subTripId: "leg" });
    expect(placeBooking(b({ startDate: "2027-05-01" }), days, trip)).toMatchObject({ subTripId: "leg", outsideTrip: true });
    expect(placeBooking(b({ matchActivityId: "a2" }), days, trip)).toEqual({ subTripId: "leg", activityId: "a2" });
    // A made-up id is ignored.
    expect(placeBooking(b({ matchActivityId: "nope", startDate: "2027-04-03" }), days, trip)).toMatchObject({ subTripId: "d2", activityId: undefined });
  });

  test("normalizeBooking keeps only valid dates, times and links", () => {
    expect(b({ kind: "Car rental", startDate: "April 2", startTime: "9:05", endTime: "13pm", bookingUrl: "https://hertz.com/manage" })).toMatchObject({
      kind: "car",
      startDate: undefined,
      startTime: "09:05",
      endTime: undefined,
      bookingUrl: "https://hertz.com/manage",
    });
  });

  test("email parsing finds the trip token and readable text", () => {
    const email = parseInboundEmail({ To: '"Trip" <me+trip-0123456789abcdef0123456789abcdef@in.example.com>', html: '<a href="https://x.com/b">Manage</a><br>Seat&nbsp;3A' });
    expect(tokenFrom(email.recipients, "in.example.com")).toBe("0123456789abcdef0123456789abcdef");
    expect(tokenFrom(email.recipients, "other.com")).toBeNull();
    expect(email.text).toBe("Manage (https://x.com/b)\nSeat 3A");
    expect(htmlToText("<script>x</script><div>A</div><div>B</div>")).toBe("A\nB");
  });
});
