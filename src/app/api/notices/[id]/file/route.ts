import { privateFileHeaders } from "@/lib/file-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Streams a notice's attachment to anyone signed in. */
export async function GET(_: Request, { params }: RouteContext<"/api/notices/[id]/file">) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const { id } = await params;
  const file = await db.noticeFile.findUnique({ where: { noticeId: id } });
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.data), {
    headers: privateFileHeaders(file),
  });
}
