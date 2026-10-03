import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { createLeaveType, updateLeaveType } from "../actions";

export const metadata = { title: "Leave types" };

export default async function LeaveTypesPage() {
  await requireUser(["ADMIN"]);
  const types = await db.leaveType.findMany({ orderBy: { code: "asc" } });
  return (
    <>
      <PageHeader title="Leave types" subtitle="Annual quota in days per calendar year. 0 means no limit (e.g. loss of pay)." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto p-0 lg:col-span-2">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Quota · Paid · Active</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td className="font-mono">{t.code}</td>
                  <td>{t.name}</td>
                  <td>
                    <form action={updateLeaveType.bind(null, t.id)} className="flex items-center gap-3">
                      <input name="annualQuota" type="number" step="0.5" min="0" defaultValue={t.annualQuota} className="input w-20" />
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="paid" defaultChecked={t.paid} /> Paid
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="active" defaultChecked={t.active} /> Active
                      </label>
                      <button className="btn-secondary btn-sm">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ActionForm action={createLeaveType} className="card space-y-3 self-start">
          <h2 className="font-semibold">Add leave type</h2>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Code">
              <input name="code" required maxLength={6} className="input" placeholder="ML" />
            </Field>
            <Field label="Name" className="col-span-2">
              <input name="name" required className="input" placeholder="Maternity leave" />
            </Field>
          </div>
          <Field label="Days per year" className="block">
            <input name="annualQuota" type="number" step="0.5" min="0" defaultValue={0} className="input" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="paid" defaultChecked /> Paid leave
          </label>
          <SubmitButton>Add</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
