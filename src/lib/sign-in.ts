import "server-only";
import { db } from "./db";

const COUNT_WITHIN_MS = 24 * 60 * 60 * 1000; // wrong passwords older than a day are forgotten
const IP_MAX_FAILURES = 30; // from one device or connection, across all emails
const IP_WINDOW_MS = 15 * 60 * 1000;

export type LockRules = { loginMaxAttempts: number; loginLockMinutes: number };

/**
 * Wrong passwords for this email since its last good sign-in (or admin unlock), and until when it is
 * locked. Works the same for emails without a login, so a lock says nothing about who works here.
 */
export async function emailLock(email: string, rules: LockRules, now = new Date()) {
  const since = new Date(now.getTime() - COUNT_WITHIN_MS);
  const lastOk = await db.loginAttempt.findFirst({ where: { email, ok: true, at: { gte: since } }, orderBy: { at: "desc" } });
  const failures = await db.loginAttempt.findMany({
    where: { email, ok: false, at: { gt: lastOk?.at ?? since } },
    orderBy: { at: "desc" },
    select: { at: true },
  });
  const lockMs = rules.loginLockMinutes * 60 * 1000;
  const lockedUntil =
    failures.length >= rules.loginMaxAttempts ? new Date(failures[0].at.getTime() + lockMs) : null;
  return {
    failures: failures.length,
    left: Math.max(0, rules.loginMaxAttempts - failures.length),
    lockedUntil: lockedUntil && lockedUntil > now ? lockedUntil : null,
  };
}

/** Whether this connection has tried too many wrong passwords lately, whatever the emails. */
export async function ipBlocked(ip: string | null, now = new Date()) {
  if (!ip) return false;
  const failures = await db.loginAttempt.count({ where: { ip, ok: false, at: { gte: new Date(now.getTime() - IP_WINDOW_MS) } } });
  return failures >= IP_MAX_FAILURES;
}

export function recordAttempt(email: string, ip: string | null, ok: boolean) {
  return db.loginAttempt.create({ data: { email, ip, ok } });
}

/** Clears the wrong-password count (admin unlock, password reset). */
export function unlockEmail(email: string) {
  return db.loginAttempt.create({ data: { email, ip: "unlock", ok: true } });
}

/** Emails locked right now, for the Users page. */
export async function lockedEmails(emails: string[], rules: LockRules) {
  const locks = await Promise.all(emails.map(async (e) => [e, (await emailLock(e, rules)).lockedUntil] as const));
  return new Map(locks.filter(([, until]) => until));
}

export const minutesUntil = (d: Date) => Math.max(1, Math.ceil((d.getTime() - Date.now()) / 60000));
