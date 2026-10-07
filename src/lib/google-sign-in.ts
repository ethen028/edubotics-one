import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { unseal } from "./secret-box";

// "Sign in with Google" (OpenID Connect, authorization code with PKCE). Off until an admin fills in a
// Google client under Admin → Settings and switches it on; see docs/google-sign-in.md.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const FLOW_COOKIE = "eb_google";
export const FLOW_MAX_AGE = 10 * 60; // the round trip to Google has to finish within 10 minutes

type GoogleSettings = {
  googleEnabled: boolean;
  googleClientId: string | null;
  googleClientSecret: string | null;
  googleDomain: string | null;
  appAddress: string | null;
};
export type GoogleSetup = { clientId: string; clientSecret: string; domain: string | null; redirectUri: string };

/** The address Google sends people back to; it goes into the Google client as an "authorised redirect URI". */
export const callbackUrl = (appAddress: string) => `${appAddress.replace(/\/+$/, "")}/auth/google/callback`;

/** Whether an app address can be used with Google: https, or http only on this computer itself. */
export function appAddressProblem(address: string) {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return "Enter the full address, starting with https://";
  }
  if (url.pathname !== "/" || url.search || url.hash) return "Enter just the address, like https://one.eduboticsglobal.com (nothing after the name).";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return null;
  return "Google only sends people back to an https:// address (or http://localhost on the office computer itself). An office Wi-Fi address like http://192.168.1.20:3000 won't work.";
}

/** Everything Google sign-in needs, or null when it is off or not filled in. */
export function googleSetup(s: GoogleSettings): GoogleSetup | null {
  if (!s.googleEnabled || !s.googleClientId || !s.appAddress) return null;
  const clientSecret = unseal(s.googleClientSecret);
  if (!clientSecret) return null;
  return { clientId: s.googleClientId, clientSecret, domain: s.googleDomain, redirectUri: callbackUrl(s.appAddress) };
}

export class GoogleSignInError extends Error {
  constructor(public code: GoogleErrorCode) {
    super(code);
  }
}

export const GOOGLE_ERRORS = {
  off: "Google sign-in is switched off. Sign in with your email and password.",
  expired: "That Google sign-in took too long or was started in another tab. Try again.",
  cancelled: "Google sign-in was cancelled.",
  domain: "Use your company Google account.",
  unverified: "Google hasn't verified that email address yet.",
  "no-login": "Your Google account's email has no login here. Ask an admin to create one with the same email.",
  disabled: "Your login is switched off. Ask an admin.",
  "other-google": "This login is already linked to a different Google account.",
  failed: "Couldn't finish signing in with Google. Try again, or use your email and password.",
} as const;
export type GoogleErrorCode = keyof typeof GOOGLE_ERRORS;

const b64url = (b: Buffer) => b.toString("base64url");

/** A fresh state, nonce and PKCE pair for one round trip. */
export function newFlow() {
  const verifier = b64url(randomBytes(32));
  return {
    state: b64url(randomBytes(24)),
    nonce: b64url(randomBytes(24)),
    verifier,
    challenge: b64url(createHash("sha256").update(verifier).digest()),
  };
}

export function authorizationUrl(setup: GoogleSetup, flow: { state: string; nonce: string; challenge: string }) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: setup.clientId,
    redirect_uri: setup.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: flow.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    ...(setup.domain ? { hd: setup.domain } : {}),
  }).toString();
  return url;
}

/** Trades the code Google sent back for a signed ID token. */
export async function exchangeCode(setup: GoogleSetup, code: string, verifier: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: setup.clientId,
      client_secret: setup.clientSecret,
      redirect_uri: setup.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !body.id_token) {
    console.error("Google token exchange failed", res.status, body.error);
    throw new GoogleSignInError("failed");
  }
  return body.id_token;
}

/** Checks Google's signature, that the token is for this app and this round trip, and returns who signed in. */
export async function verifyIdToken(idToken: string, setup: Pick<GoogleSetup, "clientId" | "domain">, nonce: string, keys: JWTVerifyGetKey = GOOGLE_KEYS) {
  let claims;
  try {
    ({ payload: claims } = await jwtVerify(idToken, keys, { issuer: ISSUERS, audience: setup.clientId }));
  } catch (e) {
    console.error("Google ID token rejected", e);
    throw new GoogleSignInError("failed");
  }
  if (claims.nonce !== nonce) throw new GoogleSignInError("expired");
  if (typeof claims.sub !== "string" || typeof claims.email !== "string") throw new GoogleSignInError("failed");
  if (claims.email_verified !== true) throw new GoogleSignInError("unverified");
  const email = claims.email.trim().toLowerCase();
  // hd is only present for Google Workspace accounts; a gmail.com account has none.
  if (setup.domain && (claims.hd !== setup.domain || !email.endsWith(`@${setup.domain}`))) throw new GoogleSignInError("domain");
  return { sub: claims.sub, email };
}
