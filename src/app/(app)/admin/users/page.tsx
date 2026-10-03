import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, Options, PageHeader } from "@/components/ui";
import { humanize } from "@/lib/format";
import { createUser, resetPassword, updateUser } from "../actions";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireUser(["ADMIN"]);
  const [users, employees] = await Promise.all([
    db.user.findMany({ include: { employee: true }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { status: { not: "EXITED" } }, orderBy: { firstName: "asc" } }),
  ]);
  const unlinked = employees.filter((e) => !e.userId);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Admins manage HR records and settings. Managers approve leave for their team. Everyone can use the CRM."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {users.map((u) => (
            <div key={u.id} className="card">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-medium">{u.name}</span>
                <span className="text-sm text-slate-500">{u.email}</span>
                {!u.active && <Badge color="red">Disabled</Badge>}
                {u.id === me.id && <Badge color="blue">You</Badge>}
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <form action={updateUser.bind(null, u.id)} className="flex flex-wrap items-end gap-2">
                  <Field label="Role">
                    <select name="role" defaultValue={u.role} className="input w-auto">
                      <Options values={["EMPLOYEE", "MANAGER", "ADMIN"]} labels={humanize} />
                    </select>
                  </Field>
                  <Field label="Employee record">
                    <select name="employeeId" defaultValue={u.employee?.id ?? ""} className="input w-auto">
                      <option value="">— none —</option>
                      {employees
                        .filter((e) => !e.userId || e.userId === u.id)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.firstName} {e.lastName} ({e.code})
                          </option>
                        ))}
                    </select>
                  </Field>
                  <label className="flex items-center gap-1 pb-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={u.active} /> Active
                  </label>
                  <button className="btn-secondary">Save</button>
                </form>
                <ActionForm action={resetPassword.bind(null, u.id)} className="flex items-end gap-2">
                  <Field label="New password">
                    <input name="password" minLength={8} className="input w-40" autoComplete="off" />
                  </Field>
                  <SubmitButton className="btn-secondary">Reset</SubmitButton>
                </ActionForm>
              </div>
            </div>
          ))}
        </div>
        <ActionForm action={createUser} className="card space-y-3 self-start">
          <h2 className="font-semibold">New login</h2>
          <Field label="Name" className="block">
            <input name="name" required className="input" />
          </Field>
          <Field label="Email" className="block">
            <input name="email" type="email" required className="input" />
          </Field>
          <Field label="Role" className="block">
            <select name="role" defaultValue="EMPLOYEE" className="input">
              <Options values={["EMPLOYEE", "MANAGER", "ADMIN"]} labels={humanize} />
            </select>
          </Field>
          <Field label="Link to employee" className="block">
            <select name="employeeId" className="input">
              <option value="">— none —</option>
              {unlinked.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Temporary password" className="block">
            <input name="password" required minLength={8} className="input" autoComplete="off" />
          </Field>
          <SubmitButton>Create login</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
