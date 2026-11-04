import { SignJWT, exportJWK, generateKeyPair, importPKCS8, exportPKCS8 } from "jose";
import { ORBIT_TOKEN_AUDIENCE, ORBIT_TOKEN_ISSUER } from "@convex/lib/token";

/**
 * The short-lived token that tells Convex who is calling (see src/lib/convex.ts). Kept free of server-only
 * imports so the key script and the tests can use it.
 */

export const CONVEX_TOKEN_SECONDS = 5 * 60;
/** One key at a time; a new pair (and Convex's ORBIT_JWKS) replaces the old one. */
export const CONVEX_KEY_ID = "orbit-1";

export type ConvexClaims = { userId: string; sessionId: string; companyId: string; role: string; isOwner: boolean };

export async function signConvexToken(claims: ConvexClaims, privateKeyPem: string) {
  const key = await importPKCS8(privateKeyPem.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({ sid: claims.sessionId, companyId: claims.companyId, role: claims.role, isOwner: claims.isOwner })
    .setProtectedHeader({ alg: "ES256", kid: CONVEX_KEY_ID, typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuer(ORBIT_TOKEN_ISSUER)
    .setAudience(ORBIT_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${CONVEX_TOKEN_SECONDS}s`)
    .sign(key);
}

/**
 * A new key pair: the private key for Next (CONVEX_AUTH_PRIVATE_KEY, one line with \n) and the public key
 * as a JWKS data URI for Convex (ORBIT_JWKS). Both are made by `npm run convex:keys` or docker/start.sh.
 */
export async function newConvexKeys() {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: CONVEX_KEY_ID, alg: "ES256", use: "sig" };
  const jwks = JSON.stringify({ keys: [jwk] });
  return {
    privateKeyPem: (await exportPKCS8(privateKey)).trim().replace(/\n/g, "\\n"),
    jwksDataUri: `data:text/plain;charset=utf-8;base64,${Buffer.from(jwks).toString("base64")}`,
  };
}

/**
 * Convex hands out file addresses on its public origin (CONVEX_CLOUD_ORIGIN on the office copy). Inside
 * Docker, Next reaches Convex by its service name (CONVEX_URL), so the address is pointed back at that.
 * With Convex's hosted service both are the same and nothing changes.
 */
export function onConvexUrl(address: string, convexUrl: string) {
  const internal = new URL(convexUrl);
  const url = new URL(address);
  url.protocol = internal.protocol;
  url.host = internal.host;
  return url.toString();
}
