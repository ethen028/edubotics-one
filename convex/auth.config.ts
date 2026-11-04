import type { AuthConfig } from "convex/server";
import { ORBIT_TOKEN_AUDIENCE, ORBIT_TOKEN_ISSUER } from "./lib/token";

/**
 * Convex trusts one sign-in: Orbit's own. Next signs a short-lived token for the current session
 * (src/lib/convex.ts) with Orbit's private key; ORBIT_JWKS holds the matching public key as a data URI,
 * so Convex never has to call back to the app. `npm run convex:keys` makes the pair.
 */
export default {
  providers: [
    {
      type: "customJwt",
      applicationID: ORBIT_TOKEN_AUDIENCE,
      issuer: ORBIT_TOKEN_ISSUER,
      jwks: process.env.ORBIT_JWKS!,
      algorithm: "ES256",
    },
  ],
} satisfies AuthConfig;
