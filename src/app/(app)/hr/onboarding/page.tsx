import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { managedEmployees } from "@/lib/team";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { ProgressBar, progressOf } from "../employees/[id]/sections";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const team = await managedEmployees(user);
  const ids = team.map((e) => e.id);
  const [tasks, documents, joiners] = await Promise.all([
    db.onboardingTask.findMany({ where: { employeeId: { in: ids } }, orderBy: { dueDate: "asc" } }),
    isAdmin(user)
      ? db.employeeDocument.findMany({
          where: { status: { in: ["PENDING", "UNDER_REVIEW"] }, employeeId: { not: user.employee?.id } },
          omit: { data: true },
          include: { employee: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, dateOfJoining: true } }),
  ]);
  const joined = new Map(joiners.map((j) => [j.id, j.dateOfJoining]));
  const rows = team
    .map((e) => ({ e, tasks: tasks.filter((t) => t.employeeId === e.id) }))
    .filter((r) => r.e.status === "ONBOARDING" || r.tasks.some((t) => t.status === "PENDING" || t.status === "IN_PROGRESS"));

  return (
    <>
      <PageHeader title="Onboarding" subtitle="New joiners and anyone with open checklist tasks. Open a person to manage their checklist." />

      {isAdmin(user) && (
        <div className="card mb-6 text-sm">
          <h2 className="mb-3 font-semibold">Documents waiting for verification</h2>
          {documents.length === 0 ? (
            <p className="text-slate-500">Nothing to verify.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/hr/employees/${d.employee.id}`} className="link">
                      {d.employee.firstName} {d.employee.lastName}
                    </Link>{" "}
                    · {d.type} ·{" "}
                    <a href={`/api/documents/${d.id}`} target="_blank" className="link">
                      {d.fileName}
                    </a>
                  </div>
                  <span className="text-xs text-slate-500">uploaded {formatDate(d.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <Empty>No one is onboarding right now. Set an employee&apos;s status to Onboarding, or add a checklist from their profile.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Joined</th>
                <th className="w-48">Progress</th>
                <th>Next task</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, tasks }) => {
                const progress = progressOf(tasks);
                const next = tasks.find((t) => t.status === "PENDING" || t.status === "IN_PROGRESS");
                return (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/hr/employees/${e.id}`} className="link">
                        {e.firstName} {e.lastName}
                      </Link>
                      <div className="text-xs text-slate-500">{e.designation}</div>
                    </td>
                    <td>{formatDate(joined.get(e.id))}</td>
                    <td>
                      {progress === null ? (
                        <span className="text-xs text-slate-500">No checklist yet</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <ProgressBar value={progress} />
                          <span className="text-xs">{progress}%</span>
                        </div>
                      )}
                    </td>
                    <td className="text-sm">
                      {next ? (
                        <>
                          {next.title}
                          {next.dueDate && <span className="text-xs text-slate-500"> · due {formatDate(next.dueDate)}</span>}
                        </>
                      ) : (
                        <Badge color="green">All done</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
