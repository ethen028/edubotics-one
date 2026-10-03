import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** Every payslip line for the month, for the accountant or the bank transfer. */
export async function GET(_: Request, { params }: RouteContext<"/payroll/[month]/export">) {
  await requireUser(["ADMIN"]);
  const { month } = await params;
  const run = await db.payrollRun.findUnique({
    where: { month },
    include: { payslips: { include: { employee: true }, orderBy: { employee: { firstName: "asc" } } } },
  });
  if (!run) return new Response("Not found", { status: 404 });
  const rows = [
    ["Code", "Name", "Paid days", "LOP days", "Basic", "HRA", "Special allowance", "Other earnings", "Gross", "LOP deduction", "PF", "ESI", "PT", "TDS", "Other deductions", "Net pay"],
    ...run.payslips.map((p) => [
      p.employee.code,
      `${p.employee.firstName} ${p.employee.lastName}`.trim(),
      Number(p.paidDays),
      Number(p.lopDays),
      ...[p.basic, p.hra, p.specialAllowance, p.otherEarnings, p.gross, p.lopDeduction, p.pf, p.esi, p.professionalTax, p.tds, p.otherDeductions, p.net].map(Number),
    ]),
  ];
  return new Response(rows.map((r) => r.map(csv).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-${month}.csv"` },
  });
}
