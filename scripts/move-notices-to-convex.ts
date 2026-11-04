/**
 * Copies the notice board (notices, their files and acknowledgements) from PostgreSQL into Convex, company by
 * company. Safe to run more than once: notices already copied are skipped. PostgreSQL keeps its copy, so going
 * back to the old version loses nothing that was there before the move.
 *
 *   npm run convex:move-notices
 *
 * Needs DATABASE_URL, CONVEX_URL and CONVEX_AUTH_PRIVATE_KEY (the office copy has them in the app container:
 * `docker compose exec app npm run convex:move-notices`). It acts as each company's owner (or first admin).
 */
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { onConvexUrl, signConvexToken } from "../src/lib/convex-token";

if (existsSync(".env")) loadEnvFile(".env");

const ms = (d: Date | null) => (d ? d.getTime() : undefined);

async function main() {
  const url = process.env.CONVEX_URL;
  const privateKey = process.env.CONVEX_AUTH_PRIVATE_KEY;
  if (!url || !privateKey) throw new Error("Set CONVEX_URL and CONVEX_AUTH_PRIVATE_KEY first.");
  const db = new PrismaClient();
  try {
    const companies = await db.company.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
    for (const company of companies) {
      const admin = await db.user.findFirst({
        where: { companyId: company.id, role: "ADMIN", active: true },
        orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      const notices = await db.notice.findMany({
        where: { companyId: company.id },
        include: { attachment: true, acks: true },
        orderBy: { createdAt: "asc" },
      });
      if (notices.length === 0) continue;
      if (!admin) throw new Error(`${company.name} has notices but no active admin to copy them as.`);

      const client = new ConvexHttpClient(url);
      client.setAuth(
        await signConvexToken({ userId: admin.id, sessionId: "move-notices-script", companyId: company.id, role: "ADMIN", isOwner: true }, privateKey),
      );
      let added = 0;
      for (const n of notices) {
        let attachment;
        if (n.attachment) {
          const address = await client.mutation(api.notices.uploadUrl, {});
          const res = await fetch(onConvexUrl(address, url), { method: "POST", headers: { "Content-Type": n.attachment.mimeType }, body: Buffer.from(n.attachment.data) });
          if (!res.ok) throw new Error(`Uploading the file of "${n.title}" failed (${res.status}).`);
          const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
          attachment = { storageId, fileName: n.attachment.fileName, mimeType: n.attachment.mimeType, size: n.attachment.size };
        }
        const result = await client.mutation(api.notices.importFromPostgres, {
          legacyId: n.id,
          kind: n.kind,
          title: n.title,
          body: n.body,
          category: n.category ?? undefined,
          pinned: n.pinned,
          requiresAck: n.requiresAck,
          ackDueDate: ms(n.ackDueDate),
          showUntil: ms(n.showUntil),
          version: n.version,
          authorId: n.authorId,
          attachment,
          archivedAt: ms(n.archivedAt),
          createdAt: n.createdAt.getTime(),
          updatedAt: n.updatedAt.getTime(),
          acks: n.acks.map((a) => ({ userId: a.userId, version: a.version, ackedAt: a.ackedAt.getTime() })),
        });
        if (result.added) added++;
      }
      console.log(`${company.name}: ${notices.length} notices, ${added} copied now, ${notices.length - added} were already in Convex.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
