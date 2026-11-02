import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { SignInMethod } from "@prisma/client";
import { rawDb as db } from "./db"; // sign-in works across the whole group
import { cookieSecure, sessionSecret } from "./auth";
import { seal, unseal } from "./secret-box";
import { hashBackupCode, looksLikeBackupCode, matchTotp, newBackupCodes, newTotpSecret } from "./totp";

/**
 * The optional second sign-in step. After a right password (or Google), someone with codes switched on gets a
 * short-lived "code asked" cookie instead of a session, and is signed in only once /login/code accepts a code
 * from their authenticator app or one of their backup codes.
 */

const CHALLENGE = "eb_code";
const CHALLENGE_MINUTES = 5;

/** Changes when the password does, so a code step started before a password reset can't finish after it. */
const passwordFingerprint = (hash: string) => createHash("sha256").update(hash).digest("base64url").slice(0, 22);

export async function startCodeChallenge(userId: string, method: SignInMethod, passwordHash: string) {
  const token = await new SignJWT({ sub: userId, m: method, p: passwordFingerprint(passwordHash), use: "sign-in-code" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_MINUTES}m`)
    .sign(sessionSecret());
  (await cookies()).set(CHALLENGE, token, { httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: CHALLENGE_MINUTES * 60 });
}

export async function readCodeChallenge() {
  const token = (await cookies()).get(CHALLENGE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (payload.use !== "sign-in-code" || typeof payload.sub !== "string" || typeof payload.p !== "string") return null;
    if (payload.m !== "PASSWORD" && payload.m !== "GOOGLE") return null;
    return { userId: payload.sub, method: payload.m as SignInMethod, fingerprint: payload.p };
  } catch {
    return null;
  }
}

export async function clearCodeChallenge() {
  (await cookies()).delete(CHALLENGE);
}

export const challengeMatches = (passwordHash: string, fingerprint: string) => passwordFingerprint(passwordHash) === fingerprint;

/** Uses a typed code once: "app" for an authenticator code, "backup" for a backup code, or null. */
export async function redeemSignInCode(user: { id: string; totpSecret: string | null; totpLastStep: number | null }, typed: string) {
  const text = typed.trim().slice(0, 40);
  if (looksLikeBackupCode(text)) {
    const hash = hashBackupCode(text);
    // Removed in the same statement that checks it, so two tabs can't both use one code.
    const used = await db.$executeRaw`UPDATE "User" SET "totpBackupCodes" = array_remove("totpBackupCodes", ${hash}) WHERE "id" = ${user.id} AND ${hash} = ANY("totpBackupCodes")`;
    return used === 1 ? "backup" : null;
  }
  const secret = unseal(user.totpSecret);
  if (!secret) return null;
  const step = matchTotp(secret, text, Date.now(), user.totpLastStep);
  if (step === null) return null;
  const { count } = await db.user.updateMany({
    where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return count === 1 ? "app" : null;
}

/** Starts setting codes up: a new app key, not asked for at sign-in until a code from it is confirmed. */
export async function beginCodeSetup(userId: string) {
  const secret = newTotpSecret();
  await db.user.update({ where: { id: userId }, data: { totpSecret: seal(secret), totpEnabledAt: null, totpLastStep: null, totpBackupCodes: [] } });
  return secret;
}

/** The key being set up, to show on My account, or null when there is none (or codes are already on). */
export function pendingSecret(user: { totpSecret: string | null; totpEnabledAt: Date | null }) {
  return user.totpEnabledAt ? null : unseal(user.totpSecret);
}

/** Switches codes on once the first code from the app is right. Returns the backup codes to show once. */
export async function confirmCodeSetup(user: { id: string; totpSecret: string | null; totpEnabledAt: Date | null }, typed: string) {
  const secret = pendingSecret(user);
  if (!secret) return null;
  const step = matchTotp(secret, typed, Date.now(), null);
  if (step === null) return null;
  const codes = newBackupCodes();
  const { count } = await db.user.updateMany({
    where: { id: user.id, totpEnabledAt: null, totpSecret: user.totpSecret },
    data: { totpEnabledAt: new Date(), totpLastStep: step, totpBackupCodes: codes.map(hashBackupCode) },
  });
  return count === 1 ? codes : null;
}

export async function replaceBackupCodes(userId: string) {
  const codes = newBackupCodes();
  await db.user.update({ where: { id: userId }, data: { totpBackupCodes: codes.map(hashBackupCode) } });
  return codes;
}

export async function turnOffCodes(userId: string) {
  await db.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpBackupCodes: [] } });
}
