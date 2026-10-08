import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cache } from "react";
import type { Role, SignInMethod } from "@prisma/client";
import { db } from "./db";
import { requestIp } from "./activity";

const COOKIE = "eb_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days: everyone signs in again at least once a week
const SEEN_EVERY_MS = 5 * 60 * 1000; // how often "last used" is written, to keep page loads cheap

export function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

export const cookieSecure = () =>
  // Off only for plain-http office setups (see docker-compose.yml).
  process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** Signs this browser in: a session row (which can be ended from anywhere) named by a signed cookie. */
export async function createSession(userId: string, method: SignInMethod = "PASSWORD") {
  const h = await headers();
  const session = await db.session.create({
    data: { userId, method, ip: await requestIp(), userAgent: h.get("user-agent")?.slice(0, 300) ?? null },
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const token = await new SignJWT({ sub: userId, sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(sessionSecret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: MAX_AGE });
}

/** Signs this browser out. */
export async function destroySession() {
  const current = await getCurrentSession();
  if (current) await db.session.updateMany({ where: { id: current.session.id, endedAt: null }, data: { endedAt: new Date() } });
  (await cookies()).delete(COOKIE);
}

/** Signs a person out on every browser (optionally keeping one). */
export async function endSessions(userId: string, exceptSessionId?: string) {
  const { count } = await db.session.updateMany({
    where: { userId, endedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { endedAt: new Date() },
  });
  return count;
}

/** The signed-in session and user (with their employee record), or null. Cached per request. */
export const getCurrentSession = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let sid: string;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (!payload.sub || typeof payload.sid !== "string") return null; // older cookies had no session: sign in again
    sid = payload.sid;
  } catch {
    return null;
  }
  const [session, settings] = await Promise.all([
    db.session.findUnique({ where: { id: sid }, include: { user: { include: { employee: true } } } }),
    db.companySettings.findUnique({ where: { id: 1 }, select: { sessionIdleHours: true } }),
  ]);
  if (!session || session.endedAt || !session.user.active) return null;
  const now = Date.now();
  const idleLimit = (settings?.sessionIdleHours ?? 12) * 60 * 60 * 1000;
  if (now - session.lastSeenAt.getTime() > idleLimit) {
    await db.session.update({ where: { id: session.id }, data: { endedAt: new Date(session.lastSeenAt.getTime() + idleLimit) } });
    return null;
  }
  if (now - session.lastSeenAt.getTime() > SEEN_EVERY_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }
  const { user, ...rest } = session;
  return { session: rest, user };
});

/** The signed-in user (with their employee record), or null. Cached per request. */
export const getCurrentUser = cache(async () => (await getCurrentSession())?.user ?? null);

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Use at the top of every protected page and server action. */
export async function requireUser(roles?: Role[]): Promise<CurrentUser> {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const { user, session } = current;
  // A temporary or too-weak password has to be replaced before anything else (not when signed in with Google).
  if (user.mustChangePassword && session.method === "PASSWORD") redirect("/change-password");
  if (roles && !roles.includes(user.role)) redirect("/?denied=1");
  return user;
}

export const isAdmin = (u: { role: Role }) => u.role === "ADMIN";
export const isManagerOrAdmin = (u: { role: Role }) => u.role === "ADMIN" || u.role === "MANAGER";
