import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { htmlToText, IMPORT_FILE_TYPES, MAX_IMPORT_BYTES } from "./lib/bookings";
import { googlePhotoUri, googlePlacesKey } from "./lib/googlePlaces";
import { billingEventUserId, verifySvix } from "./lib/webhook";

const http = httpRouter();

type Attachment = { name?: string; content?: string; contentType?: string };
type InboundEmail = {
  recipients: string[];
  from?: string;
  subject?: string;
  text?: string;
  attachments: Attachment[];
};

const str = (x: unknown) => (typeof x === "string" ? x : undefined);

/**
 * Reads an inbound-email webhook. Postmark's JSON is the reference shape (To,
 * ToFull, OriginalRecipient, Subject, TextBody, HtmlBody, Attachments with
 * base64 Content); lowercase variants (to, subject, text, html, attachments)
 * from other providers and Cloudflare Email Workers are accepted too.
 */
export function parseInboundEmail(body: Record<string, unknown>): InboundEmail {
  const get = (...keys: string[]) => keys.map((k) => body[k]).find((x) => x !== undefined && x !== null);
  const recipients = new Set<string>();
  for (const value of [get("OriginalRecipient"), get("To", "to"), get("recipient"), get("Cc", "cc")]) {
    for (const m of str(value)?.match(/[^\s<>,;"']+@[^\s<>,;"']+/g) ?? []) recipients.add(m.toLowerCase());
  }
  for (const entry of [...((get("ToFull") as unknown[]) ?? []), ...((get("CcFull") as unknown[]) ?? [])]) {
    const email = str((entry as Record<string, unknown>)?.Email);
    if (email) recipients.add(email.toLowerCase());
  }
  const html = str(get("HtmlBody", "html"));
  const text = str(get("TextBody", "text", "plain")) || (html ? htmlToText(html) : undefined);
  const attachments = ((get("Attachments", "attachments") as unknown[]) ?? []).map((a) => {
    const r = (a ?? {}) as Record<string, unknown>;
    return {
      name: str(r.Name ?? r.filename ?? r.name),
      content: str(r.Content ?? r.content),
      contentType: str(r.ContentType ?? r.contentType ?? r.content_type)?.toLowerCase().split(";")[0]?.trim(),
    };
  });
  return { recipients: [...recipients], from: str(get("From", "from")), subject: str(get("Subject", "subject")), text, attachments };
}

/** The trip token in a "trip-<token>@<domain>" address (plus-addressing works too). */
export function tokenFrom(recipients: string[], domain?: string) {
  for (const r of recipients) {
    const [local, host] = r.split("@");
    if (domain && host !== domain.toLowerCase()) continue;
    const m = local?.match(/(?:^|[+])trip-([0-9a-f]{32})$/);
    if (m) return m[1]!;
  }
  return null;
}

const sameSecret = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Forwarded confirmation emails. Point your inbound email provider (e.g. Postmark
 * inbound) at https://<deployment>.convex.site/inbound/email?key=<INBOUND_EMAIL_SECRET>
 * for the INBOUND_EMAIL_DOMAIN. Mail to an unknown or disabled address is dropped.
 */
http.route({
  path: "/inbound/email",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.INBOUND_EMAIL_SECRET;
    const url = new URL(request.url);
    const basic = request.headers.get("authorization")?.match(/^Basic\s+(.+)$/i)?.[1];
    const given = url.searchParams.get("key") ?? (basic ? atob(basic).split(":").slice(1).join(":") : "");
    if (!secret || !sameSecret(given, secret)) return new Response("Unauthorized", { status: 401 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response("Expected JSON", { status: 400 });
    }
    const email = parseInboundEmail(body);
    const token = tokenFrom(email.recipients, process.env.INBOUND_EMAIL_DOMAIN);
    // Always 200 for well-formed mail, so the provider doesn't retry mail we chose to drop.
    if (!token) return new Response("ignored", { status: 200 });

    // The first PDF or image attachment is read along with the email body.
    const attachment = email.attachments.find((a) => a.content && (IMPORT_FILE_TYPES as readonly string[]).includes(a.contentType ?? ""));
    let storageId;
    if (attachment) {
      const bytes = Uint8Array.from(atob(attachment.content!), (c) => c.charCodeAt(0));
      if (bytes.length <= MAX_IMPORT_BYTES) storageId = await ctx.storage.store(new Blob([bytes], { type: attachment.contentType }));
    }
    await ctx.runMutation(internal.bookings.receiveEmail, {
      token,
      text: email.text,
      subject: email.subject,
      from: email.from,
      storageId,
      fileName: storageId ? attachment?.name : undefined,
    });
    return new Response("ok", { status: 200 });
  }),
});

/**
 * GET /place-photo/<placeId>?w=1000 redirects to a current Google photo of a
 * place. Google photo URLs expire and may not be stored, so activities link here
 * instead; browsers and the apps cache the result for a day.
 */
http.route({
  pathPrefix: "/place-photo/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const placeId = decodeURIComponent(url.pathname.slice("/place-photo/".length));
    const width = Math.min(Math.max(Number(url.searchParams.get("w")) || 1000, 100), 1600);
    const key = googlePlacesKey();
    if (!key || !placeId || !(await ctx.runQuery(internal.photos.isKnownPlace, { placeId }))) {
      return new Response("Not found", { status: 404 });
    }
    const photo = await googlePhotoUri(placeId, key, width);
    if (!photo) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
    return new Response(null, { status: 302, headers: { Location: photo, "Cache-Control": "public, max-age=86400" } });
  }),
});

/**
 * Clerk Billing webhook: point a Clerk webhook endpoint for the subscription and
 * subscriptionItem events at <CONVEX_SITE_URL>/clerk/billing. The event only says
 * whose subscription changed; billing.sync re-reads it from Clerk.
 */
http.route({
  path: "/clerk/billing",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!secret) return new Response("Billing webhook is not set up", { status: 503 });
    const body = await req.text();
    if (!(await verifySvix(req.headers, body, secret))) return new Response("Bad signature", { status: 401 });
    let event: { type?: string } = {};
    try {
      event = JSON.parse(body) as { type?: string };
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }
    const userId = billingEventUserId(event);
    if (userId && /^subscription/.test(event.type ?? "")) {
      await ctx.scheduler.runAfter(0, internal.billing.sync, { userId });
    }
    return new Response(null, { status: 204 });
  }),
});

export default http;
