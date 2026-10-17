import { getCurrentUser, isManagerOrAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageWorkshop } from "@/lib/workshops";
import { pdfResponse, receiptPdf } from "@/lib/pdf";

/** One fee receipt, the same file that is attached when it's emailed. Fees are for admins and managers only. */
export async function GET(req: Request, { params }: RouteContext<"/workshops/receipts/[id]/pdf">) {
  const user = await getCurrentUser();
  const id = (await params).id;
  const p = await db.workshopPayment.findUnique({ where: { id }, select: { registration: { select: { workshop: { select: { coordinatorId: true } } } } } });
  if (!user || !p || !isManagerOrAdmin(user) || !canManageWorkshop(user, p.registration.workshop)) return new Response("Not found", { status: 404 });
  const file = await receiptPdf(id);
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
