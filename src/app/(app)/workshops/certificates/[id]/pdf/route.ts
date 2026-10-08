import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canMarkAttendance } from "@/lib/workshops";
import { certificatePdf, pdfResponse } from "@/lib/pdf";

/** One certificate, the same file that is attached when it's emailed. Trainers on the workshop can open it too. */
export async function GET(req: Request, { params }: RouteContext<"/workshops/certificates/[id]/pdf">) {
  const user = await getCurrentUser();
  const id = (await params).id;
  const cert = await db.workshopCertificate.findUnique({
    where: { id },
    select: { registration: { select: { workshop: { select: { coordinatorId: true, trainers: { select: { userId: true } } } } } } },
  });
  if (!user || !cert || !canMarkAttendance(user, cert.registration.workshop)) return new Response("Not found", { status: 404 });
  const file = await certificatePdf(id);
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
