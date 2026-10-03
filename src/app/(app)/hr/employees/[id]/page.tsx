import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { getLeaveBalances } from "@/lib/leave-balance";
import { Badge, PageHeader } from "@/components/ui";
import { formatDate, humanize } from "@/lib/format";
import { EmployeeForm } from "../../employee-form";
import { updateEmployee } from "../../actions";
import { LeaveStatusBadge } from "../../leave/status-badge";

export default async function EmployeePage({ params }: PageProps<"/hr/employees/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const employee = await db.employee.findUnique({
    where: { id },
    include: {
      department: true,
      manager: true,
      reports: { orderBy: { firstName: "asc" } },
      user: { select: { email: true, role: true, active: true } },
      leaveRequests: { include: { leaveType: true }, orderBy: { startDate: "desc" }, take: 10 },
    },
  });
  if (!employee) notFound();

  const admin = isAdmin(user);
  const isSelf = user.employee?.id === employee.id;
  const isManager = user.employee?.id === employee.managerId;
  const canSeePrivate = admin || isSelf || isManager;
  const name = `${employee.firstName} ${employee.lastName}`;

  const [balances, departments, managers] = await Promise.all([
    canSeePrivate ? getLeaveBalances(employee.id) : Promise.resolve([]),
    admin ? db.department.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    admin ? db.employee.findMany({ where: { status: { not: "EXITED" } }, orderBy: { firstName: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={name}
        subtitle={
          <>
            {employee.designation}
            {employee.department && ` · ${employee.department.name}`} · {employee.code}{" "}
            {employee.status !== "ACTIVE" && <Badge color="amber">{humanize(employee.status)}</Badge>}
          </>
        }
        actions={
          <Link href="/hr/employees" className="btn-secondary">
            Back to people
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card text-sm">
          <h2 className="mb-3 font-semibold">Overview</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-slate-500">Email</dt>
            <dd>{employee.workEmail}</dd>
            <dt className="text-slate-500">Phone</dt>
            <dd>{employee.phone ?? "—"}</dd>
            <dt className="text-slate-500">Reports to</dt>
            <dd>
              {employee.manager ? (
                <Link className="link" href={`/hr/employees/${employee.manager.id}`}>
                  {employee.manager.firstName} {employee.manager.lastName}
                </Link>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-slate-500">Joined</dt>
            <dd>{formatDate(employee.dateOfJoining)}</dd>
            <dt className="text-slate-500">Type</dt>
            <dd>{humanize(employee.employmentType)}</dd>
            {admin && (
              <>
                <dt className="text-slate-500">Login</dt>
                <dd>
                  {employee.user ? `${humanize(employee.user.role)}${employee.user.active ? "" : " (disabled)"}` : "None"}
                </dd>
              </>
            )}
          </dl>
          {employee.reports.length > 0 && (
            <>
              <h3 className="mt-4 mb-1 text-xs font-semibold text-slate-500 uppercase">Team</h3>
              <ul className="space-y-0.5">
                {employee.reports.map((r) => (
                  <li key={r.id}>
                    <Link className="link" href={`/hr/employees/${r.id}`}>
                      {r.firstName} {r.lastName}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {canSeePrivate && (
          <div className="card text-sm lg:col-span-2">
            <h2 className="mb-3 font-semibold">Leave this year</h2>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {balances.map((b) => (
                <div key={b.leaveTypeId} className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{b.name}</div>
                  <div className="text-lg font-semibold">{b.remaining ?? "∞"}</div>
                  <div className="text-xs text-slate-500">
                    {b.used} used{b.pending ? `, ${b.pending} pending` : ""}
                  </div>
                </div>
              ))}
            </div>
            {employee.leaveRequests.length > 0 && (
              <table className="table">
                <tbody>
                  {employee.leaveRequests.map((r) => (
                    <tr key={r.id}>
                      <td>{r.leaveType.code}</td>
                      <td>
                        {formatDate(r.startDate)}
                        {r.endDate.getTime() !== r.startDate.getTime() && ` – ${formatDate(r.endDate)}`}
                      </td>
                      <td>{r.days}d</td>
                      <td>
                        <LeaveStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {admin && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Edit record</h2>
          <EmployeeForm
            action={updateEmployee.bind(null, employee.id)}
            employee={employee}
            departments={departments}
            managers={managers}
          />
        </>
      )}
    </>
  );
}
