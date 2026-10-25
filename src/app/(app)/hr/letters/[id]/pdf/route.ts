import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSeeLetter } from "@/lib/letter-rules";
import { letterPdf, pdfResponse } from "@/lib/pdf";

/** An issued letter as a PDF: the same file that is attached when it's emailed. */
export async function GET(req: Request, { params }: RouteContext<"/hr/letters/[id]/pdf">) {
  const auth = await getApiUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  const letter = await db.hrLetter.findUnique({ where: { id }, select: { kind: true, employeeId: true, status: true } });
  if (!letter || !canSeeLetter(auth.user, letter)) return new Response("Not found", { status: 404 });
  const file = await letterPdf(id);
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
