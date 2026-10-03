import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { istDate } from "@/lib/attendance";
import { RUN_COLOR, monthLabel } from "@/lib/payroll";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, PageHeader } from "@/components/ui";
import { formatDate, formatINR, humanize, toDateInput } from "@/lib/format";
import { deleteRun, finalizeRun, markPaid, recalculateRun, removeSlip, reopenRun, updateSlip } from "../actions";

export default async function PayrollRunPage({ params }: PageProps<"/payroll/[month]">) {
  await requireUser(["ADMIN"]);
  const { month } = await params;
  const [run, settings] = await Promise.all([
    db.payrollRun.findUnique({
      where: { month },
      include: { payslips: { include: { employee: true }, orderBy: { employee: { firstName: "asc" } } } },
    }),
    getSettings(),
  ]);
  if (!run) notFound();
  const draft = run.status === "DRAFT";
  const sum = (k: "gross" | "totalDeductions" | "net") => run.payslips.reduce((s, p) => s + Number(p[k]), 0);
  const deductionsOn = [settings.pfEnabled && "PF", settings.esiEnabled && "ESI", settings.ptEnabled && "PT", settings.tdsEnabled && "TDS"].filter(Boolean);

  return (
    <>
      <PageHeader
        title={`Payroll · ${monthLabel(month)}`}
        subtitle={
          <>
            <Badge color={RUN_COLOR[run.status]}>{humanize(run.status)}</Badge>{" "}
            {run.paidOn && `Paid on ${formatDate(run.paidOn)} · `}
            Statutory deductions: {deductionsOn.length ? deductionsOn.join(", ") : "none switched on"} ·{" "}
            <Link href="/admin/settings" className="link">
              Settings
            </Link>
          </>
        }
        actions={
          <>
            <a href={`/payroll/${month}/export`} className="btn-secondary">
              Download CSV
            </a>
            <Link href="/payroll" className="btn-secondary">
              All months
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3 text-center sm:max-w-xl">
        {(
          [
            ["Gross", sum("gross")],
            ["Deductions", sum("totalDeductions")],
            ["Net pay", sum("net")],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="card p-3">
            <div className="text-lg font-semibold">{formatINR(v)}</div>
            <div className="text-xs text-slate-500">{k}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {draft && (
          <>
            <form action={recalculateRun.bind(null, run.id)}>
              <button className="btn-secondary">Recalculate from salaries and leave</button>
            </form>
            <form action={finalizeRun.bind(null, run.id)}>
              <button className="btn-primary">Finalize and publish payslips</button>
            </form>
            <form action={deleteRun.bind(null, run.id)}>
              <button className="btn-danger">Delete draft</button>
            </form>
          </>
        )}
        {run.status === "FINALIZED" && (
          <>
            <form action={markPaid.bind(null, run.id)} className="flex items-center gap-2">
              <input type="date" name="paidOn" required defaultValue={toDateInput(istDate(new Date()))} className="input w-auto" />
              <button className="btn-primary">Mark as paid</button>
            </form>
            <form action={reopenRun.bind(null, run.id)}>
              <button className="btn-secondary">Reopen to edit</button>
            </form>
          </>
        )}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th className="text-right">Paid days</th>
              <th className="text-right">LOP</th>
              <th className="text-right">Gross</th>
              <th className="text-right">Deductions</th>
              <th className="text-right">Net pay</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {run.payslips.map((p) => (
              <tr key={p.id} className="align-top">
                <td>
                  <Link href={`/hr/employees/${p.employee.id}#salary`} className="link">
                    {p.employee.firstName} {p.employee.lastName}
                  </Link>
                  <div className="text-xs text-slate-500">{p.employee.code}</div>
                  {p.note && <div className="text-xs text-slate-500">{p.note}</div>}
                  {draft && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-xs text-brand-700">Adjust</summary>
                      <ActionForm action={updateSlip.bind(null, p.id)} className="mt-2 grid max-w-md grid-cols-2 gap-2">
                        <label className="text-xs">
                          LOP days
                          <input name="lopDays" type="number" step="0.5" min="0" defaultValue={Number(p.lopDays)} className="input py-1" />
                        </label>
                        <label className="text-xs">
                          Other earnings (₹)
                          <input name="otherEarnings" type="number" min="0" defaultValue={Number(p.otherEarnings)} className="input py-1" />
                        </label>
                        {settings.ptEnabled && (
                          <label className="text-xs">
                            Professional tax (₹)
                            <input name="professionalTax" type="number" min="0" defaultValue={Number(p.professionalTax)} className="input py-1" />
                          </label>
                        )}
                        {settings.tdsEnabled && (
                          <label className="text-xs">
                            TDS (₹)
                            <input name="tds" type="number" min="0" defaultValue={Number(p.tds)} className="input py-1" />
                          </label>
                        )}
                        <label className="text-xs">
                          Other deductions (₹)
                          <input name="otherDeductions" type="number" min="0" defaultValue={Number(p.otherDeductions)} className="input py-1" />
                        </label>
                        <label className="col-span-2 text-xs">
                          Note on payslip
                          <input name="note" defaultValue={p.note ?? ""} placeholder="e.g. Diwali bonus" className="input py-1" />
                        </label>
                        <div className="col-span-2">
                          <SubmitButton className="btn-primary btn-sm">Update</SubmitButton>
                        </div>
                      </ActionForm>
                    </details>
                  )}
                </td>
                <td className="text-right">
                  {Number(p.paidDays)}/{p.daysInMonth}
                </td>
                <td className="text-right">{Number(p.lopDays) || "—"}</td>
                <td className="text-right">{formatINR(p.gross)}</td>
                <td className="text-right">{formatINR(p.totalDeductions)}</td>
                <td className="text-right font-semibold">{formatINR(p.net)}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/payroll/payslip/${p.id}`} className="link text-sm">
                    Payslip
                  </Link>
                  {draft && (
                    <form action={removeSlip.bind(null, p.id)} className="inline">
                      <button className="ml-3 text-xs text-slate-400 hover:text-red-600" title="Leave out of this month">
                        ✕
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
