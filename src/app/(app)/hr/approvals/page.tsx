import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { decideLeave } from "../actions";
import { LeaveStatusBadge } from "../leave/status-badge";

export const metadata = { title: "Leave approvals" };

export default async function ApprovalsPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  // Admins see everyone's requests; managers see their direct reports'.
  const scope: Prisma.LeaveRequestWhereInput = isAdmin(user)
    ? {}
    : { employee: { managerId: user.employee?.id ?? "__none__" } };

  const [pending, recent] = await Promise.all([
    db.leaveRequest.findMany({
      where: { ...scope, status: "PENDING", employeeId: { not: user.employee?.id ?? "" } },
      include: { employee: true, leaveType: true },
      orderBy: { startDate: "asc" },
    }),
    db.leaveRequest.findMany({
      where: { ...scope, status: { not: "PENDING" } },
      include: { employee: true, leaveType: true },
      orderBy: { decidedAt: { sort: "desc", nulls: "last" } },
      take: 20,
    }),
  ]);

  return (
    <>
      <PageHeader title="Leave approvals" subtitle={isAdmin(user) ? "All employees" : "Your direct reports"} />
      <h2 className="mb-3 font-semibold">Waiting for you ({pending.length})</h2>
      {pending.length === 0 ? (
        <Empty>Nothing to approve.</Empty>
      ) : (
        <div className="space-y-3">
          {pending.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-start justify-between gap-4">
              <div className="text-sm">
                <Link href={`/hr/employees/${r.employee.id}`} className="link">
                  {r.employee.firstName} {r.employee.lastName}
                </Link>
                <div className="mt-0.5">
                  {r.leaveType.name} · {r.days} day(s) · {formatDate(r.startDate)}
                  {r.endDate.getTime() !== r.startDate.getTime() && ` – ${formatDate(r.endDate)}`}
                  {r.halfDay && " (half day)"}
                </div>
                <div className="mt-1 text-slate-500">{r.reason}</div>
              </div>
              <form action={decideLeave.bind(null, r.id)} className="flex flex-wrap items-center gap-2">
                <input name="note" placeholder="Note (optional)" className="input w-48" />
                <button name="decision" value="APPROVED" className="btn-primary btn-sm">
                  Approve
                </button>
                <button name="decision" value="REJECTED" className="btn-danger btn-sm">
                  Reject
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-8 mb-3 font-semibold">Recent decisions</h2>
      {recent.length === 0 ? (
        <Empty>None yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave</th>
                <th>Dates</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.employee.firstName} {r.employee.lastName}
                  </td>
                  <td>
                    {r.leaveType.code} · {r.days}d
                  </td>
                  <td>
                    {formatDate(r.startDate)}
                    {r.endDate.getTime() !== r.startDate.getTime() && ` – ${formatDate(r.endDate)}`}
                  </td>
                  <td>
                    <LeaveStatusBadge status={r.status} />
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
