import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageWorkshop } from "@/lib/workshops";
import { pdfResponse, workshopCertificatesPdf } from "@/lib/pdf";

/** Every issued certificate of the workshop in one PDF, one page each, to print in one go. */
export async function GET(req: Request, { params }: RouteContext<"/workshops/[id]/certificates/pdf">) {
  const user = await getCurrentUser();
  const w = await db.workshop.findUnique({ where: { id: (await params).id } });
  if (!user || !w || !canManageWorkshop(user, w)) return new Response("Not found", { status: 404 });
  const file = await workshopCertificatesPdf(w.id, w.title);
  if (!file) return new Response("No certificates issued yet", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
