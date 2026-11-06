/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { tokyoAdventure } from "./lib/fakeData";
import { billingEventUserId, verifySvix } from "./lib/webhook";
import { fetchClerkSubscription } from "./billing";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  // Billing applies only with Clerk on; demo mode has no limits.
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://example.clerk.accounts.dev");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function setup() {
  const t = convexTest(schema, modules);
  const ana = t.withIdentity({ subject: "user_ana", name: "Ana" });
  return { t, ana };
}

const firstActivity = async (ana: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, tripId: string) =>
  (await ana.query(api.trips.get, { tripId: tripId as never }))!.subTrips[0]!.activities[0]!;

test("the first trip is free to plan, but starting it needs a subscription", async () => {
  const { ana } = await setup();
  expect(await ana.query(api.billing.status, {})).toMatchObject({ blocked: null, subscribed: false, enforced: true });

  await ana.mutation(internal.trips.saveGenerated, { userId: "user_ana", prompt: "Tokyo", model: "m", tree: tokyoAdventure });
  const [trip] = await ana.query(api.trips.list, {});
  expect(await ana.query(api.billing.status, {})).toMatchObject({ blocked: "subscribe", tripsCreated: 1 });
  expect(await ana.query(api.billing.tripLocked, { tripId: trip!._id })).toEqual({ locked: true, isOwner: true });

  // Can't start it…
  const activity = await firstActivity(ana, trip!._id);
  await expect(ana.mutation(api.activities.setCompleted, { activityId: activity._id, isCompleted: true })).rejects.toThrow(
    "Subscribe to start this trip",
  );
  // …or plan a second one.
  await expect(
    ana.mutation(internal.trips.saveGenerated, { userId: "user_ana", prompt: "Kyoto", model: "m", tree: tokyoAdventure }),
  ).rejects.toThrow("Subscribe to plan more trips");

  // Deleting the free trip doesn't hand out another free one.
  await ana.mutation(api.trips.remove, { tripId: trip!._id });
  expect(await ana.query(api.billing.status, {})).toMatchObject({ blocked: "subscribe", tripsCreated: 1 });
});

test("subscribers can start trips and keep up to 3 upcoming", async () => {
  const { t, ana } = await setup();
  await t.mutation(internal.billing.save, { userId: "user_ana", subscribed: true });
  const save = () => ana.mutation(internal.trips.saveGenerated, { userId: "user_ana", prompt: "Tokyo", model: "m", tree: tokyoAdventure });
  const first = await save();
  await save();
  await save();
  expect(await ana.query(api.billing.status, {})).toMatchObject({ subscribed: true, upcoming: 3, blocked: "tooManyUpcoming" });
  await expect(save()).rejects.toThrow("You already have 3 upcoming trips");

  const activity = await firstActivity(ana, first);
  await ana.mutation(api.activities.setCompleted, { activityId: activity._id, isCompleted: true });

  // Once a trip is over it no longer counts.
  await t.run((ctx) => ctx.db.patch("trips", first, { startDate: "2020-01-01", endDate: "2020-01-03" }));
  expect(await ana.query(api.billing.status, {})).toMatchObject({ upcoming: 2, blocked: null });

  // Canceled: access lasts until the paid period ends.
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  await t.mutation(internal.billing.save, { userId: "user_ana", subscribed: true, periodEnd: Date.parse("2026-12-01") });
  expect(await ana.query(api.billing.tripLocked, { tripId: first })).toMatchObject({ locked: false });
  vi.setSystemTime(new Date("2026-12-02T12:00:00Z"));
  expect(await ana.query(api.billing.tripLocked, { tripId: first })).toMatchObject({ locked: true });
});

test("fetchClerkSubscription reads the Traveler plan from Clerk", async () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  const reply = (items: unknown[]) => vi.stubGlobal("fetch", vi.fn(async () => json({ subscription_items: items })));

  reply([{ status: "active", plan: { slug: "free_user" } }]);
  expect(await fetchClerkSubscription("user_ana", "sk", now)).toEqual({ subscribed: false, periodEnd: undefined });

  reply([{ status: "active", plan: { slug: "traveler" } }]);
  expect(await fetchClerkSubscription("user_ana", "sk", now)).toEqual({ subscribed: true, periodEnd: undefined });

  reply([{ status: "canceled", plan: { slug: "traveler" }, period_end: now + 86_400_000 }]);
  expect(await fetchClerkSubscription("user_ana", "sk", now)).toEqual({ subscribed: true, periodEnd: now + 86_400_000 });

  reply([{ status: "ended", plan: { slug: "traveler" }, period_end: now - 1 }]);
  expect(await fetchClerkSubscription("user_ana", "sk", now)).toMatchObject({ subscribed: false });

  vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)));
  expect(await fetchClerkSubscription("user_ana", "sk", now)).toBeNull();
});

test("the Clerk webhook checks its Svix signature, then re-reads the subscription", async () => {
  const secretBytes = new TextEncoder().encode("test-secret-test-secret");
  const secret = `whsec_${btoa(String.fromCharCode(...secretBytes))}`;
  const body = JSON.stringify({ type: "subscriptionItem.active", data: { payer: { user_id: "user_ana" } } });
  const ts = Math.floor(Date.now() / 1000).toString();
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`msg_1.${ts}.${body}`)))));
  const headers = new Headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,${sig}` });

  expect(await verifySvix(headers, body, secret)).toBe(true);
  expect(await verifySvix(headers, body.replace("ana", "eve"), secret)).toBe(false);
  expect(billingEventUserId(JSON.parse(body))).toBe("user_ana");

  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", secret);
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
  vi.stubGlobal("fetch", vi.fn(async () => json({ subscription_items: [{ status: "active", plan: { slug: "traveler" } }] })));
  const { t, ana } = await setup();
  expect((await t.fetch("/clerk/billing", { method: "POST", headers: { "svix-id": "x", "svix-timestamp": ts, "svix-signature": "v1,bad" }, body })).status).toBe(401);
  expect((await t.fetch("/clerk/billing", { method: "POST", headers, body })).status).toBe(204);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await ana.query(api.billing.status, {})).toMatchObject({ subscribed: true });
});

test("copying a shared trip counts as planning one", async () => {
  const { t, ana } = await setup();
  const bob = t.withIdentity({ subject: "user_bob", name: "Bob" });
  await bob.mutation(internal.trips.saveGenerated, { userId: "user_bob", prompt: "Tokyo", model: "m", tree: tokyoAdventure });
  const [shared] = await bob.query(api.trips.list, {});
  const token = await bob.mutation(api.trips.share, { tripId: shared!._id });

  // Ana's free trip can be a copy…
  await ana.mutation(api.trips.copyShared, { token, startDate: "2027-04-10" });
  expect(await ana.query(api.billing.status, {})).toMatchObject({ blocked: "subscribe", tripsCreated: 1 });
  // …but a second copy needs a subscription.
  await expect(ana.mutation(api.trips.copyShared, { token, startDate: "2027-05-10" })).rejects.toThrow("Subscribe to plan more trips");
});
