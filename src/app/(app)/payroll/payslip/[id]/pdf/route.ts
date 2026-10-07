import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { payslipPdf, pdfResponse } from "@/lib/pdf";

/** A payslip as a PDF, for admins and for the employee once payroll is finalised (as on the payslip page). */
export async function GET(req: Request, { params }: RouteContext<"/payroll/payslip/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const slip = await db.payslip.findUnique({ where: { id }, select: { employeeId: true, run: { select: { status: true } } } });
  const own = slip && user.employee?.id === slip.employeeId && slip.run.status !== "DRAFT";
  if (!slip || (!isAdmin(user) && !own)) return new Response("Not found", { status: 404 });
  const file = await payslipPdf(id);
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
