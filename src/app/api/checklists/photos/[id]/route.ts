import { privateFileHeaders } from "@/lib/file-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSeeUser } from "@/lib/checklists";

/** Streams a checklist photo to the person whose checklist it is, their manager, or an admin. */
export async function GET(_: Request, { params }: RouteContext<"/api/checklists/photos/[id]">) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const user = access.user;
  const { id } = await params;
  const photo = await db.checklistPhoto.findUnique({ where: { id }, include: { tick: { select: { run: { select: { userId: true } } } } } });
  if (!photo || !(await canSeeUser(user, photo.tick.run.userId))) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(photo.data), {
    headers: privateFileHeaders(photo),
  });
}
