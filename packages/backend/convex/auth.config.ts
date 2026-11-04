import type { AuthConfig } from "convex/server";

/**
 * Clerk is enabled once CLERK_JWT_ISSUER_DOMAIN is set on the deployment:
 *   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
 * Until then the backend runs in demo mode (see lib/auth.ts).
 */
const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: domain ? [{ domain, applicationID: "convex" }] : [],
} satisfies AuthConfig;
