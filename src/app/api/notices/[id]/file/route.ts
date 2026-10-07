import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Streams a notice's attachment to anyone signed in. */
export async function GET(_: Request, { params }: RouteContext<"/api/notices/[id]/file">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const file = await db.noticeFile.findUnique({ where: { noticeId: id } });
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
