import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/ui";
import { createDepartment, deleteDepartment } from "../actions";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  await requireUser(["ADMIN"]);
  const departments = await db.department.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { employees: true } } },
  });
  return (
    <>
      <PageHeader title="Departments" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto p-0 lg:col-span-2">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>People</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d._count.employees}</td>
                  <td className="text-right">
                    <form action={deleteDepartment.bind(null, d.id)}>
                      <button className="btn-danger btn-sm">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ActionForm action={createDepartment} className="card space-y-3 self-start">
          <h2 className="font-semibold">Add department</h2>
          <input name="name" required placeholder="e.g. Training" className="input" />
          <SubmitButton>Add</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
