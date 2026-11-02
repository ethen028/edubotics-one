import { getCurrentSession } from "@/lib/auth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function POST() {
  const current = await getCurrentSession();
  if (!current) return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  await db.session.updateMany({ where: { id: current.session.id, userId: current.user.id, endedAt: null }, data: { endedAt: new Date() } });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
