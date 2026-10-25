import "server-only";
import type { SignInMethod } from "@prisma/client";
import { rawDb as db } from "./db"; // a person can sign in whichever company they are in

/** Atomic credential check and session creation, independent of Next's request context. */
export async function createSessionRecord(
  userId: string,
  method: SignInMethod,
  expectedPasswordHash: string | undefined,
  metadata: { ip: string | null; userAgent: string | null },
) {
  return db.$transaction(async (tx) => {
    // Password resets and changes acquire this same lock before touching credentials/sessions.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !user.active || user.closedAt ||
        (method === "PASSWORD" && (!expectedPasswordHash || user.passwordHash !== expectedPasswordHash))) return null;
    const created = await tx.session.create({
      data: { userId, method, ...metadata },
    });
    await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    return created;
  }, { maxWait: 10000, timeout: 15000 });
}

