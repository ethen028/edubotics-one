import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DASHBOARDS, PERMISSION_ROWS, ROLE_COLUMNS, ROLE_DUTIES } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  await requireUser(["ADMIN"]);
  const [counts, owners] = await Promise.all([
    db.user.groupBy({ by: ["role"], where: { active: true, closedAt: null }, _count: true }),
    db.user.count({ where: { active: true, closedAt: null, isOwner: true } }),
  ]);
  const count = (column: (typeof ROLE_COLUMNS)[number]) =>
    column === "Owner" ? owners : (counts.find((row) => row.role === column.toUpperCase())?._count ?? 0) - (column === "Admin" ? owners : 0);
  const landing: Record<(typeof ROLE_COLUMNS)[number], string> = { Owner: DASHBOARDS[0].label, Admin: DASHBOARDS[1].label, HR: DASHBOARDS[2].label, Manager: `${DASHBOARDS[3].label}, with their team`, Employee: DASHBOARDS[3].label };
  return <>
    <PageHeader title="Roles & permissions" subtitle="Four fixed roles plus the company owner. Each role reaches only what its job needs; the same rules apply to pages, actions and private downloads, so typing an address doesn't get round them."
      actions={<Link href="/admin/users" className="btn-primary">Manage user roles</Link>} />
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {ROLE_COLUMNS.map(role => <section key={role} className="card">
        <div className="flex items-baseline justify-between gap-2"><h2 className="font-semibold">{role}</h2><span className="text-2xl font-semibold text-brand-600">{count(role)}</span></div>
        <p className="mt-2 text-sm text-slate-600">{ROLE_DUTIES[role]}</p>
        <p className="mt-2 text-xs text-slate-500">Lands on: {landing[role]}</p>
      </section>)}
    </div>
    <p id="permissions-scroll-hint" className="mb-2 text-sm text-slate-500">Compare permissions across roles. On smaller screens, scroll the table horizontally.</p>
    <div className="card permissions-matrix overflow-x-auto p-0" role="region" aria-label="Role permission comparison" aria-describedby="permissions-scroll-hint" tabIndex={0}>
      <table className="table"><caption className="p-4 text-left font-semibold">Access by role</caption>
        <thead><tr><th scope="col">Capability</th>{ROLE_COLUMNS.map(role => <th key={role} scope="col" className={role === "HR" ? "permissions-hr" : undefined}>{role}</th>)}</tr></thead>
        <tbody>{PERMISSION_ROWS.map(row => <tr key={row.label}><th scope="row" className="text-left font-medium">{row.label}</th>{row.access.map((value, index) => <td key={ROLE_COLUMNS[index]} className={ROLE_COLUMNS[index] === "HR" ? "permissions-hr" : undefined}>{value}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="mt-4 text-sm text-slate-600">The owner is an admin with an owner mark: one person, handed over with &ldquo;Make owner&rdquo; in Users. Only the owner can change the owner&apos;s own login. Change roles in Users; role changes are recorded in the activity log and take effect on the next request. HR cannot create logins, change roles or edit linked Admin employee records. Unknown document categories require Admin access. Recruitment salary expectations and advertised job ranges are visible to recruiters; employee compensation stays private.</p>
    <Link href="/admin/activity" className="link mt-3 inline-block text-sm">Review role change history</Link>
  </>;
}
