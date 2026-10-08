import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, Options, PageHeader } from "@/components/ui";
import { formatDateTime, humanize } from "@/lib/format";
import { PASSWORD_RULES } from "@/lib/passwords";
import { lockedEmails, minutesUntil } from "@/lib/sign-in";
import { getSettings } from "@/lib/settings";
import { createUser, resetPassword, signOutEverywhere, unlockUser, updateUser } from "../actions";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireUser(["ADMIN"]);
  const [users, employees, settings] = await Promise.all([
    db.user.findMany({
      include: { employee: true, _count: { select: { sessions: { where: { endedAt: null } } } } },
      orderBy: { name: "asc" },
    }),
    db.employee.findMany({ where: { status: { not: "EXITED" } }, orderBy: { firstName: "asc" } }),
    getSettings(),
  ]);
  const locked = await lockedEmails(
    users.map((u) => u.email),
    settings,
  );
  const unlinked = employees.filter((e) => !e.userId);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Admins manage HR records and settings. Managers approve leave for their team. Everyone can use the CRM. A new or reset password is temporary: the person picks their own at the next sign-in."
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
                {locked.has(u.email) && <Badge color="red">Locked for {minutesUntil(locked.get(u.email)!)} min</Badge>}
                {u.mustChangePassword && <Badge color="amber">Picks a new password at next sign-in</Badge>}
                {u.googleSub && <Badge color="green">Google linked</Badge>}
              </div>
              <div className="-mt-2 mb-3 text-xs text-slate-500">
                {u.lastLoginAt ? `Last signed in ${formatDateTime(u.lastLoginAt)}` : "Never signed in"}
                {u._count.sessions > 0 && ` · signed in on ${u._count.sessions} ${u._count.sessions === 1 ? "device" : "devices"}`}
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
                {locked.has(u.email) && (
                  <form action={unlockUser.bind(null, u.id)}>
                    <button className="btn-secondary">Unlock</button>
                  </form>
                )}
                {u._count.sessions > 0 && u.id !== me.id && (
                  <form action={signOutEverywhere.bind(null, u.id)}>
                    <button className="btn-secondary">Sign out everywhere</button>
                  </form>
                )}
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
            <p className="mt-1 text-xs text-slate-500">{PASSWORD_RULES} They pick their own at the first sign-in.</p>
          </Field>
          <SubmitButton>Create login</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
