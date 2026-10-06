import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { istDate } from "@/lib/attendance";
import { readTeamFilter, teamClaimsWhere } from "@/lib/expense-data";
import { CATEGORY_LABEL, CLAIM_LABEL } from "@/lib/expenses";
import { toDateInput } from "@/lib/format";

const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** The claims shown on Team expenses, for the accountant. */
export async function GET(request: Request) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const filter = readTeamFilter(sp, toDateInput(istDate(new Date())).slice(0, 7));
  const claims = await db.expenseClaim.findMany({
    where: teamClaimsWhere(user, filter),
    include: {
      employee: { select: { code: true, firstName: true, lastName: true } },
      project: { select: { name: true } },
      organization: { select: { name: true } },
      payslip: { select: { run: { select: { month: true } } } },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const rows = [
    ["Date", "Code", "Name", "Category", "Description", "Km", "Project", "Institution", "Claimed", "Approved", "Status", "Payroll month", "Paid on", "Note"],
    ...claims.map((c) => [
      toDateInput(c.date),
      c.employee.code,
      `${c.employee.firstName} ${c.employee.lastName}`.trim(),
      CATEGORY_LABEL[c.category],
      c.description,
      c.distanceKm === null ? "" : Number(c.distanceKm),
      c.project?.name ?? "",
      c.organization?.name ?? "",
      Number(c.amount),
      c.approvedAmount === null ? "" : Number(c.approvedAmount),
      CLAIM_LABEL[c.status],
      c.payslip?.run.month ?? "",
      c.paidOn ? toDateInput(c.paidOn) : "",
      c.paidNote ?? c.decisionNote ?? "",
    ]),
  ];
  return new Response(rows.map((r) => r.map(csv).join(",")).join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses-${filter.month}.csv"`,
    },
  });
}
