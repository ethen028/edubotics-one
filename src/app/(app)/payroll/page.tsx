import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { istDate } from "@/lib/attendance";
import { RUN_COLOR, monthLabel, monthRange } from "@/lib/payroll";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, PageHeader } from "@/components/ui";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { startRun } from "./actions";

export const metadata = { title: "Payroll" };

export default async function PayrollPage() {
  await requireUser(["ADMIN"]);
  const now = istDate(new Date());
  const thisMonth = now.toISOString().slice(0, 7);
  const { start, end } = monthRange(thisMonth);
  const [runs, missing] = await Promise.all([
    db.payrollRun.findMany({ orderBy: { month: "desc" }, include: { payslips: { select: { gross: true, net: true } } } }),
    db.employee.findMany({
      where: {
        dateOfJoining: { lte: end },
        OR: [{ dateOfExit: null }, { dateOfExit: { gte: start } }],
        salaries: { none: {} },
      },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  return (
    <>
      <PageHeader title="Payroll" subtitle="Monthly salary: Basic + HRA + special allowance, less loss-of-pay days and any deductions switched on in Settings." />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <ActionForm action={startRun} className="flex flex-wrap items-end gap-3">
            <Field label="Month">
              <input type="month" name="month" defaultValue={thisMonth} required className="input w-auto" />
            </Field>
            <SubmitButton>Prepare payroll</SubmitButton>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">
            Creates a draft payslip for everyone with a salary. LOP days come from approved unpaid leave; you can adjust each
            payslip before finalizing.
          </p>
        </div>
        <div className="card text-sm">
          <h2 className="mb-2 font-semibold">No salary set</h2>
          {missing.length === 0 ? (
            <p className="text-slate-500">Everyone has a salary.</p>
          ) : (
            <ul className="space-y-0.5">
              {missing.map((e) => (
                <li key={e.id}>
                  <Link href={`/hr/employees/${e.id}#salary`} className="link">
                    {e.firstName} {e.lastName}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {runs.length === 0 ? (
        <Empty>No payroll prepared yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th>People</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Net pay</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/payroll/${r.month}`} className="link">
                      {monthLabel(r.month)}
                    </Link>
                  </td>
                  <td>{r.payslips.length}</td>
                  <td className="text-right">{formatINR(r.payslips.reduce((s, p) => s + Number(p.gross), 0))}</td>
                  <td className="text-right">{formatINR(r.payslips.reduce((s, p) => s + Number(p.net), 0))}</td>
                  <td>
                    <Badge color={RUN_COLOR[r.status]}>{humanize(r.status)}</Badge>
                    {r.paidOn && <span className="ml-1 text-xs text-slate-500">{formatDate(r.paidOn)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
