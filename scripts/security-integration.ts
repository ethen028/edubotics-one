import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { issueAccountToken, consumeAccountToken } from "../src/lib/account-tokens";
import { createSessionRecord } from "../src/lib/session-store";
import { allowRequest } from "../src/lib/rate-limit";
import { queueRecoveryEmail } from "../src/lib/account-mailer";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.endsWith("_test"), "Isolated local _test database required");
  const suffix = randomUUID();
  const user = await db.user.create({ data: { email: `${suffix}@example.invalid`, name: "Security test", passwordHash: "old-test-hash" } });
  const metadata = { ip: null, userAgent: "Integration test" };
  const jobIds: string[] = [];
  try {
    const verification = await issueAccountToken(user.id, "VERIFY_EMAIL");
    assert.equal(await consumeAccountToken(verification, "RESET_PASSWORD", "new-test-hash"), null);
    assert.equal(await consumeAccountToken(verification, "VERIFY_EMAIL"), user.id);
    assert.equal(await consumeAccountToken(verification, "VERIFY_EMAIL"), null);
    assert.ok((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt);

    const expired = await issueAccountToken(user.id, "VERIFY_EMAIL");
    await db.accountToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { expiresAt: new Date(0) } });
    assert.equal(await consumeAccountToken(expired, "VERIFY_EMAIL"), null);

    const changedAddress = await issueAccountToken(user.id, "VERIFY_EMAIL");
    await db.user.update({ where: { id: user.id }, data: { email: `changed-${suffix}@example.invalid`, emailVerifiedAt: null } });
    assert.equal(await consumeAccountToken(changedAddress, "VERIFY_EMAIL"), null);
    await assert.rejects(issueAccountToken(user.id, "VERIFY_EMAIL", user.email), /address changed/);

    const concurrent = await issueAccountToken(user.id, "RESET_PASSWORD");
    const results = await Promise.all([
      consumeAccountToken(concurrent, "RESET_PASSWORD", "new-test-hash"),
      consumeAccountToken(concurrent, "RESET_PASSWORD", "new-test-hash"),
      ...Array.from({ length: 5 }, () => createSessionRecord(user.id, "PASSWORD", "old-test-hash", metadata)),
    ]);
    assert.equal(results.slice(0, 2).filter((result) => result === user.id).length, 1, "Only one reset consumes the token");
    assert.equal(await db.session.count({ where: { userId: user.id, endedAt: null } }), 0, "Old-password sign-ins cannot survive a reset race");
    assert.equal(await createSessionRecord(user.id, "PASSWORD", "old-test-hash", metadata), null);
    assert.ok(await createSessionRecord(user.id, "PASSWORD", "new-test-hash", metadata));

    await db.user.update({ where: { id: user.id }, data: { active: false } });
    const disabled = await issueAccountToken(user.id, "RESET_PASSWORD");
    assert.equal(await consumeAccountToken(disabled, "RESET_PASSWORD", "other-hash"), null);
    assert.equal(await createSessionRecord(user.id, "PASSWORD", "new-test-hash", metadata), null);

    const limitIdentity = `integration-${suffix}`;
    const attempts = await Promise.all(Array.from({ length: 12 }, () => allowRequest("integration", limitIdentity, 3, 60000)));
    assert.equal(attempts.filter(Boolean).length, 3, "Concurrent workers share an atomic limit");

    const before = new Set((await db.accountMailJob.findMany({ select: { id: true } })).map((job) => job.id));
    await queueRecoveryEmail(user.email);
    await queueRecoveryEmail(`missing-${suffix}@example.invalid`);
    const jobs = (await db.accountMailJob.findMany()).filter((job) => !before.has(job.id));
    jobIds.push(...jobs.map((job) => job.id));
    assert.equal(jobs.length, 2, "Known and unknown addresses follow the same queue path");
    for (const job of jobs) assert.ok(!job.sealedEmail.includes("@"), "Recovery destination is encrypted at rest");

    const insecure = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' AND NOT rowsecurity`;
    assert.deepEqual(insecure, [], "All application tables enable default-deny RLS for non-owner roles");
    const rollback = new Error("rollback RLS probe");
    try {
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`CREATE ROLE edubotics_security_probe NOLOGIN`;
        await tx.$executeRaw`GRANT USAGE ON SCHEMA public TO edubotics_security_probe`;
        await tx.$executeRaw`GRANT SELECT ON "User" TO edubotics_security_probe`;
        await tx.$executeRaw`SET LOCAL ROLE edubotics_security_probe`;
        const rows = await tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "User"`;
        assert.equal(Number(rows[0].count), 0, "RLS blocks a direct non-owner role even when SELECT was granted");
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    console.log("Security integration passed: token expiry/purpose/replay/address binding, concurrent reset and login, disabled accounts, shared rate limits, encrypted recovery queue, and database RLS.");
  } finally {
    await db.accountMailJob.deleteMany({ where: { id: { in: jobIds } } });
    await db.session.deleteMany({ where: { userId: user.id } });
    await db.loginAttempt.deleteMany({ where: { email: { in: [user.email, `changed-${suffix}@example.invalid`] } } });
    await db.user.delete({ where: { id: user.id } });
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Security integration failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
