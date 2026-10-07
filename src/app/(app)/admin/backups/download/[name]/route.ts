import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { backupDir, isBackupName } from "@/lib/backups";

/** Downloads one backup file, for keeping a copy on a laptop or a USB drive. Admins only, and logged. */
export async function GET(_: Request, { params }: RouteContext<"/admin/backups/download/[name]">) {
  const user = await getCurrentUser();
  const dir = backupDir();
  const { name } = await params;
  if (!user || !isAdmin(user) || !dir || !isBackupName(name)) return new Response("Not found", { status: 404 });
  const file = path.join(/*turbopackIgnore: true*/ dir, name);
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) return new Response("Not found", { status: 404 });
  await logActivity(user, "BACKUPS", "backup.downloaded", `Downloaded backup ${name}`);
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
