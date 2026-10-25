import { privateFileHeaders } from "@/lib/file-response";
import { db } from "@/lib/db";
import { loadSharedFile } from "@/lib/shared-files";
import { getTeamworkApiUser } from "@/lib/teamwork";

/** A file from Files, for anyone who can open its folder. PDFs and images open in the browser; other files download. */
export async function GET(_: Request, { params }: RouteContext<"/api/shared-files/[id]">) {
  const access = await getTeamworkApiUser();
  if (access.error) return access.error;
  const { id } = await params;
  if (!(await loadSharedFile(access.user, id))) return new Response("Not found", { status: 404 });
  const file = await db.sharedFile.findUniqueOrThrow({ where: { id }, select: { data: true, fileName: true } });
  return new Response(Buffer.from(file.data), { headers: privateFileHeaders(file) });
}
