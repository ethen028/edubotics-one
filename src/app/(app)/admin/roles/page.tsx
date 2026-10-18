import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES, PERMISSION_ROWS } from "@/lib/permissions";
import { humanize } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  await requireUser(["ADMIN"]);
  const counts = await db.user.groupBy({ by: ["role"], where: { active: true, closedAt: null }, _count: true });
  return <>
    <PageHeader title="Roles & permissions" subtitle="Four fixed roles. Permissions apply to pages, actions and private downloads."
      actions={<Link href="/admin/users" className="btn-primary">Manage user roles</Link>} />
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {ROLES.map(role => <section key={role} className="card"><h2 className="font-semibold">{humanize(role)}</h2><p className="mt-2 text-2xl font-semibold text-brand-600">{counts.find(row => row.role === role)?._count ?? 0}</p><p className="text-sm text-slate-500">Active accounts</p></section>)}
    </div>
    <p id="permissions-scroll-hint" className="mb-2 text-sm text-slate-500">Compare permissions across roles. On smaller screens, scroll the table horizontally.</p>
    <div className="card permissions-matrix overflow-x-auto p-0" role="region" aria-label="Role permission comparison" aria-describedby="permissions-scroll-hint" tabIndex={0}>
      <table className="table"><caption className="p-4 text-left font-semibold">Access by role</caption>
        <thead><tr><th scope="col">Capability</th>{ROLES.map(role => <th key={role} scope="col" className={role === "HR" ? "permissions-hr" : undefined}>{humanize(role)}</th>)}</tr></thead>
        <tbody>{PERMISSION_ROWS.map(row => <tr key={row.label}><th scope="row" className="text-left font-medium">{row.label}</th>{row.access.map((value, index) => <td key={ROLES[index]} className={ROLES[index] === "HR" ? "permissions-hr" : undefined}>{value}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="mt-4 text-sm text-slate-600">Change roles in Users. Role changes are recorded in the activity log and take effect on the next request. HR cannot create logins, change roles or edit linked Admin employee records. Unknown document categories require Admin access. Recruitment salary expectations and advertised job ranges are visible to recruiters; employee compensation stays private.</p>
    <Link href="/admin/activity" className="link mt-3 inline-block text-sm">Review role change history</Link>
  </>;
}
