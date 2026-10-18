import "server-only";
import { db } from "./db";
import { newAccountToken, tokenHash, tokenIsUsable, type TokenKind } from "./account-security";

export async function issueAccountToken(userId: string, kind: TokenKind, expectedEmail?: string) {
  const token = newAccountToken();
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    if (expectedEmail !== undefined && user.email !== expectedEmail) throw new Error("Account address changed. Request a new link.");
    await tx.accountToken.updateMany({ where: { userId, kind, usedAt: null }, data: { usedAt: now } });
    await tx.accountToken.create({ data: { userId, email: user.email, kind, tokenHash: token.hash, expiresAt: new Date(now.getTime() + (kind === "RESET_PASSWORD" ? 30 : 60) * 60000) } });
  }, { maxWait: 10000, timeout: 15000 });
  return token.raw;
}

export async function consumeAccountToken(raw: string, kind: TokenKind, passwordHash?: string) {
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  return db.$transaction(async (tx) => {
    const identity = await tx.accountToken.findUnique({ where: { tokenHash: tokenHash(raw) }, select: { userId: true } });
    if (!identity) return null;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${identity.userId} FOR UPDATE`;
    const token = await tx.accountToken.findUnique({ where: { tokenHash: tokenHash(raw) }, include: { user: true } });
    const now = new Date();
    if (!tokenIsUsable(token, kind, now) || !token || !token.user.active || token.user.closedAt || token.email !== token.user.email) return null;
    if (kind === "RESET_PASSWORD" && !passwordHash) return null;
    const consumed = await tx.accountToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (consumed.count !== 1) return null;
    await tx.user.update({ where: { id: token.userId }, data: {
      emailVerifiedAt: now,
      ...(kind === "RESET_PASSWORD" ? { passwordHash, passwordChangedAt: now, mustChangePassword: false } : {}),
    } });
    if (kind === "RESET_PASSWORD") {
      await tx.session.updateMany({ where: { userId: token.userId, endedAt: null }, data: { endedAt: now } });
      await tx.accountToken.updateMany({ where: { userId: token.userId, usedAt: null }, data: { usedAt: now } });
      await tx.loginAttempt.create({ data: { email: token.user.email, ip: "password-reset", ok: true } });
    }
    return token.userId;
  }, { maxWait: 10000, timeout: 15000 });
}
