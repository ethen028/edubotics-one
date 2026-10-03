import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { managedEmployees } from "@/lib/team";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, PageHeader } from "@/components/ui";
import { createModule, toggleModule } from "./actions";

export const metadata = { title: "Training" };

const CELL = { ASSIGNED: "○", IN_PROGRESS: "◐", COMPLETED: "●" } as const;
const CELL_COLOR = { ASSIGNED: "text-slate-400", IN_PROGRESS: "text-brand-600", COMPLETED: "text-emerald-600" } as const;

export default async function TrainingPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const admin = isAdmin(user);
  const team = await managedEmployees(user);
  const [modules, assignments] = await Promise.all([
    db.trainingModule.findMany({ orderBy: [{ active: "desc" }, { title: "asc" }], include: { _count: { select: { assignments: true } } } }),
    db.trainingAssignment.findMany({ where: { employeeId: { in: team.map((e) => e.id) } } }),
  ]);
  const active = modules.filter((m) => m.active);
  const people = team.filter((e) => assignments.some((a) => a.employeeId === e.id));

  return (
    <>
      <PageHeader title="Training" subtitle="Assign modules from a person's profile. ● done · ◐ in progress · ○ not started" />

      {people.length === 0 ? (
        <Empty>No training assigned yet. Open someone&apos;s profile to assign modules.</Empty>
      ) : (
        <div className="card mb-6 overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                {active.map((m) => (
                  <th key={m.id} className="text-center">
                    {m.title}
                  </th>
                ))}
                <th>Done</th>
              </tr>
            </thead>
            <tbody>
              {people.map((e) => {
                const mine = assignments.filter((a) => a.employeeId === e.id);
                return (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/hr/employees/${e.id}`} className="link">
                        {e.firstName} {e.lastName}
                      </Link>
                    </td>
                    {active.map((m) => {
                      const a = mine.find((x) => x.moduleId === m.id);
                      return (
                        <td key={m.id} className={`text-center text-lg ${a ? CELL_COLOR[a.status] : "text-slate-200"}`}>
                          {a ? CELL[a.status] : "·"}
                        </td>
                      );
                    })}
                    <td>
                      {mine.filter((a) => a.status === "COMPLETED").length}/{mine.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card max-w-3xl text-sm">
        <h2 className="mb-3 font-semibold">Modules</h2>
        <ul className="mb-4 divide-y divide-slate-100">
          {modules.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <div className="flex-1">
                <div className={m.active ? "" : "text-slate-400"}>{m.title}</div>
                {m.description && <div className="text-xs text-slate-500">{m.description}</div>}
              </div>
              <span className="text-xs text-slate-500">{m._count.assignments} assigned</span>
              {!m.active && <Badge>Archived</Badge>}
              {admin && (
                <form action={toggleModule.bind(null, m.id)}>
                  <button className="btn-secondary btn-sm">{m.active ? "Archive" : "Restore"}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {admin && (
          <ActionForm action={createModule} className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Title">
              <input name="title" required className="input" />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <input name="description" className="input" />
            </Field>
            <div>
              <SubmitButton>Add module</SubmitButton>
            </div>
          </ActionForm>
        )}
      </div>
    </>
  );
}
