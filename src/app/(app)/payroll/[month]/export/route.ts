import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { csvCell as csv } from "@/lib/csv";

/** Every payslip line for the month, for the accountant or the bank transfer. */
export async function GET(_: Request, { params }: RouteContext<"/payroll/[month]/export">) {
  await requireUser(["ADMIN"]);
  const { month } = await params;
  const run = await db.payrollRun.findFirst({
    where: { month },
    include: { payslips: { include: { employee: true }, orderBy: { employee: { firstName: "asc" } } } },
  });
  if (!run) return new Response("Not found", { status: 404 });
  const rows = [
    ["Code", "Name", "Bank account", "IFSC", "Name on account", "PAN", "UAN", "ESI number", "Paid days", "LOP days", "Basic", "HRA", "Special allowance", "Other earnings", "Gross", "LOP deduction", "PF", "ESI", "ESI (company share)", "PT", "TDS", "Other deductions", "Leave encashment", "Notice pay", "Gratuity", "Notice recovery", "Recoveries on leaving", "Expense claims", "Net pay", "Gratuity set aside"],
    ...run.payslips.map((p) => [
      p.employee.code,
      `${p.employee.firstName} ${p.employee.lastName}`.trim(),
      p.employee.bankAccountNo ?? "",
      p.employee.bankIfsc ?? "",
      p.employee.bankAccountName ?? "",
      p.employee.pan ?? "",
      p.employee.uan ?? "",
      p.employee.esiNumber ?? "",
      Number(p.paidDays),
      Number(p.lopDays),
      ...[p.basic, p.hra, p.specialAllowance, p.otherEarnings, p.gross, p.lopDeduction, p.pf, p.esi, p.esiEmployer, p.professionalTax, p.tds, p.otherDeductions, p.leaveEncashment, p.noticePay, p.gratuity, p.noticeRecovery, p.exitRecovery, p.reimbursements, p.net, p.gratuityProvision].map(Number),
    ]),
  ];
  return new Response(rows.map((r) => r.map(csv).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-${month}.csv"` },
  });
}
