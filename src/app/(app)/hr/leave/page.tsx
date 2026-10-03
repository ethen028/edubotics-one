import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getLeaveBalances } from "@/lib/leave-balance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Empty, Field, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { applyLeave, cancelLeave } from "../actions";
import { LeaveStatusBadge } from "./status-badge";

export const metadata = { title: "My leave" };

export default async function MyLeavePage() {
  const user = await requireUser();
  const employee = user.employee;
  if (!employee) {
    return (
      <>
        <PageHeader title="My leave" />
        <Empty>Your login isn&apos;t linked to an employee record yet. Ask an admin to link it from Admin → Users.</Empty>
      </>
    );
  }

  const [balances, requests, types] = await Promise.all([
    getLeaveBalances(employee.id),
    db.leaveRequest.findMany({
      where: { employeeId: employee.id },
      include: { leaveType: true, approver: true },
      orderBy: { startDate: "desc" },
      take: 50,
    }),
    db.leaveType.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
  ]);
  const today = new Date();

  return (
    <>
      <PageHeader title="My leave" subtitle={`Balances for ${today.getFullYear()}. Weekly offs and company holidays aren't counted.`} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {balances.map((b) => (
          <div key={b.leaveTypeId} className="card">
            <div className="text-xs font-medium text-slate-500">{b.name}</div>
            <div className="mt-1 text-2xl font-semibold">{b.remaining ?? "∞"}</div>
            <div className="text-xs text-slate-500">
              {b.quota > 0 ? `of ${b.quota} · ` : ""}
              {b.used} used{b.pending ? ` · ${b.pending} pending` : ""}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ActionForm action={applyLeave} className="card space-y-4 self-start">
          <h2 className="font-semibold">Apply for leave</h2>
          <Field label="Type" className="block">
            <select name="leaveTypeId" required className="input">
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input name="startDate" type="date" required className="input" />
            </Field>
            <Field label="To">
              <input name="endDate" type="date" required className="input" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="halfDay" /> Half day (single day only)
          </label>
          <Field label="Reason" className="block">
            <textarea name="reason" required rows={3} className="input" />
          </Field>
          <SubmitButton>Send request</SubmitButton>
          {!employee.managerId && (
            <p className="text-xs text-slate-500">You have no manager set, so an admin will approve this.</p>
          )}
        </ActionForm>

        <div className="card overflow-x-auto p-0 lg:col-span-2">
          {requests.length === 0 ? (
            <div className="p-5">
              <Empty>No leave requests yet.</Empty>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Dates</th>
                  <th>Type</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const cancellable = r.status === "PENDING" || (r.status === "APPROVED" && r.startDate > today);
                  return (
                    <tr key={r.id}>
                      <td>
                        {formatDate(r.startDate)}
                        {r.endDate.getTime() !== r.startDate.getTime() && ` – ${formatDate(r.endDate)}`}
                        <div className="text-xs text-slate-500">{r.reason}</div>
                      </td>
                      <td>{r.leaveType.name}</td>
                      <td>{r.days}</td>
                      <td>
                        <LeaveStatusBadge status={r.status} />
                        {r.decisionNote && <div className="mt-1 text-xs text-slate-500">“{r.decisionNote}”</div>}
                      </td>
                      <td className="text-right">
                        {cancellable && (
                          <form action={cancelLeave.bind(null, r.id)}>
                            <button className="btn-secondary btn-sm">Cancel</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
