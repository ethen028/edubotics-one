import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";

let lastCleanup = 0;

/** Atomic across workers and restarts. Database failures fail closed at callers. */
export async function allowRequest(scope: string, identity: string, limit: number, windowMs: number) {
  const key = `${scope}:${createHash("sha256").update(identity).digest("hex")}`;
  const now = new Date();
  const expires = new Date(now.getTime() + windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expires})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${expires} ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count"`;
  if (now.getTime() - lastCleanup > 300000) {
    lastCleanup = now.getTime();
    await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.accountToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86400000) } } });
  }
  return rows[0].count <= limit;
}
