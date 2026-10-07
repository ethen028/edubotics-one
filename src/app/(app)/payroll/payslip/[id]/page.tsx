import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { monthLabel, payslipParts } from "@/lib/payroll";
import { getSettings } from "@/lib/settings";
import { formatDate, formatINR } from "@/lib/format";
import { CATEGORY_LABEL, payableOf } from "@/lib/expenses";
import { PrintButton } from "./print-button";

export const metadata = { title: "Payslip" };

export default async function PayslipPage({ params }: PageProps<"/payroll/payslip/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const p = await db.payslip.findUnique({
    where: { id },
    include: {
      run: true,
      employee: { include: { department: true } },
      expenseClaims: { orderBy: { date: "asc" } },
    },
  });
  const own = p && user.employee?.id === p.employeeId && p.run.status !== "DRAFT";
  if (!p || (!isAdmin(user) && !own)) notFound();

  const { earnings, deductions } = payslipParts(p);
  const settings = await getSettings();

  return (
    <>
      <div className="mb-4 flex gap-2 print:hidden">
        <Link href={isAdmin(user) ? `/payroll/${p.run.month}` : "/payroll/my"} className="btn-secondary">
          Back
        </Link>
        <a href={`/payroll/payslip/${p.id}/pdf`} target="_blank" className="btn-secondary">
          PDF
        </a>
        <PrintButton />
      </div>
      <article className="card mx-auto max-w-3xl print:border-0 print:shadow-none">
        <header className="mb-6 flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="text-lg font-semibold">{settings.companyName}</div>
            <div className="text-sm text-slate-500">{settings.companyAddress}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold">Payslip</div>
            <div className="text-sm text-slate-500">{monthLabel(p.run.month)}</div>
            {p.run.status === "DRAFT" && <div className="text-xs font-semibold text-amber-700">DRAFT</div>}
          </div>
        </header>
        <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <dt className="text-slate-500">Name</dt>
          <dd>
            {p.employee.firstName} {p.employee.lastName}
          </dd>
          <dt className="text-slate-500">Employee code</dt>
          <dd>{p.employee.code}</dd>
          <dt className="text-slate-500">Designation</dt>
          <dd>{p.employee.designation}</dd>
          <dt className="text-slate-500">Department</dt>
          <dd>{p.employee.department?.name ?? "—"}</dd>
          <dt className="text-slate-500">Days in month</dt>
          <dd>{p.daysInMonth}</dd>
          <dt className="text-slate-500">Paid days</dt>
          <dd>{Number(p.paidDays)}</dd>
          <dt className="text-slate-500">LOP days</dt>
          <dd>{Number(p.lopDays)}</dd>
          <dt className="text-slate-500">Paid on</dt>
          <dd>{p.run.paidOn ? formatDate(p.run.paidOn) : "—"}</dd>
        </dl>
        <div className="grid gap-6 sm:grid-cols-2">
          <table className="table">
            <thead>
              <tr>
                <th>Earnings</th>
                <th className="text-right">₹</th>
              </tr>
            </thead>
            <tbody>
              {earnings.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="text-right">{formatINR(v)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Gross earnings</td>
                <td className="text-right">{formatINR(p.gross)}</td>
              </tr>
            </tbody>
          </table>
          <table className="table">
            <thead>
              <tr>
                <th>Deductions</th>
                <th className="text-right">₹</th>
              </tr>
            </thead>
            <tbody>
              {deductions.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-slate-500">
                    None
                  </td>
                </tr>
              )}
              {deductions.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="text-right">{formatINR(v)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total deductions</td>
                <td className="text-right">{formatINR(p.totalDeductions)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {Number(p.reimbursements) > 0 && (
          <table className="table mt-6">
            <thead>
              <tr>
                <th>Expense claims paid back</th>
                <th className="text-right">₹</th>
              </tr>
            </thead>
            <tbody>
              {p.expenseClaims.map((c) => (
                <tr key={c.id}>
                  <td>
                    {formatDate(c.date)} · {CATEGORY_LABEL[c.category]} · {c.description}
                  </td>
                  <td className="text-right">{formatINR(payableOf(c))}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total expense claims</td>
                <td className="text-right">{formatINR(p.reimbursements)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <div className="mt-6 flex items-center justify-between rounded-lg bg-slate-50 p-4">
          <span className="font-semibold">
            Net pay
            {Number(p.reimbursements) > 0 && <span className="block text-xs font-normal text-slate-500">Salary after deductions, plus expense claims</span>}
          </span>
          <span className="text-2xl font-semibold">{formatINR(p.net)}</span>
        </div>
        {p.note && <p className="mt-3 text-sm text-slate-600">Note: {p.note}</p>}
        <p className="mt-6 text-xs text-slate-400">This is a computer-generated payslip and needs no signature.</p>
      </article>
    </>
  );
}
