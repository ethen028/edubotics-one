import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSeeUser } from "@/lib/checklists";

/** Streams a checklist photo to the person whose checklist it is, their manager, or an admin. */
export async function GET(_: Request, { params }: RouteContext<"/api/checklists/photos/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const photo = await db.checklistPhoto.findUnique({ where: { id }, include: { tick: { select: { run: { select: { userId: true } } } } } });
  if (!photo || !(await canSeeUser(user, photo.tick.run.userId))) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(photo.fileName)}"`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
