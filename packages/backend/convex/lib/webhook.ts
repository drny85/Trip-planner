/**
 * Verifies a Svix-signed webhook (Clerk sends its webhooks through Svix).
 * The signature is HMAC-SHA256 of "<svix-id>.<svix-timestamp>.<body>" with the
 * base64 secret after "whsec_"; svix-signature lists "v1,<base64>" entries.
 */
const TOLERANCE_S = 5 * 60;

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function verifySvix(
  headers: Headers,
  body: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_S) return false;

  const key = await crypto.subtle.importKey("raw", b64(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return signatures.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    return version === "v1" && sig !== undefined && timingSafeEqual(sig, expected);
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The Clerk user a billing event is about: the payer's user id, wherever the event puts it. */
export function billingEventUserId(event: unknown): string | null {
  const data = (event as { data?: Record<string, unknown> })?.data;
  if (!data) return null;
  const payer = data.payer as { user_id?: unknown; userId?: unknown } | undefined;
  const id = payer?.user_id ?? payer?.userId ?? data.payer_id ?? data.user_id;
  return typeof id === "string" && id.startsWith("user_") ? id : null;
}
