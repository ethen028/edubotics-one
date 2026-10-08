import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Badge, PageHeader } from "@/components/ui";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { ContactForm, OrganizationForm } from "../../forms";
import { createContact, deleteOrganization, updateOrganization } from "../../actions";
import { activeUsers, orgOptions } from "../../data";
import { ActivityPanel, activityInclude } from "../../activity-panel";
import { dealStageColor } from "../../constants";
import { ProgrammeBadge } from "../../../operations/ui";
import { formatMoney, payStateColor, payStateLabel } from "@/lib/invoices";
import { invoicesWithBalance } from "../../../invoices/data";

export default async function OrganizationPage({ params }: PageProps<"/crm/organizations/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const org = await db.organization.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { name: "asc" } },
      deals: { orderBy: { createdAt: "desc" } },
      programmes: { orderBy: { createdAt: "desc" } },
      activities: { include: activityInclude, orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!org) notFound();
  const billing = isManagerOrAdmin(user);
  const [users, orgs, invoices] = await Promise.all([
    activeUsers(),
    orgOptions(),
    billing ? invoicesWithBalance({ organizationId: id }) : [],
  ]);
  const owed = invoices.reduce((n, i) => n + i.balance, 0);

  return (
    <>
      <PageHeader
        title={org.name}
        subtitle={
          <>
            <Badge>{humanize(org.type)}</Badge> {[org.board, org.city, org.district].filter(Boolean).join(" · ")}
            {org.phone && ` · ${org.phone}`}
          </>
        }
        actions={
          <>
            <Link href={`/crm/deals/new?org=${org.id}`} className="btn-primary">
              New deal
            </Link>
            {billing && (
              <Link href={`/invoices/new?org=${org.id}`} className="btn-secondary">
                New invoice
              </Link>
            )}
            {isAdmin(user) && (
              <form action={deleteOrganization.bind(null, org.id)}>
                <button className="btn-danger">Delete</button>
              </form>
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <div className="card p-0">
            <h2 className="px-5 pt-4 pb-2 font-semibold">Deals</h2>
            {org.deals.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-slate-500">No deals yet.</p>
            ) : (
              <table className="table">
                <tbody>
                  {org.deals.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/crm/deals/${d.id}`} className="link">
                          {d.title}
                        </Link>
                        {d.program && <div className="text-xs text-slate-500">{d.program}</div>}
                      </td>
                      <td>{formatINR(d.value)}</td>
                      <td>
                        <Badge color={dealStageColor[d.stage]}>{humanize(d.stage)}</Badge>
                      </td>
                      <td className="text-slate-500">{formatDate(d.expectedClose)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {(org.programmes.length > 0 || isManagerOrAdmin(user)) && (
            <div className="card p-0">
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <h2 className="font-semibold">School programmes</h2>
                {isManagerOrAdmin(user) && (
                  <Link href={`/operations/programmes/new?school=${org.id}`} className="link text-sm">
                    New programme
                  </Link>
                )}
              </div>
              {org.programmes.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-slate-500">No programmes running here.</p>
              ) : (
                <table className="table">
                  <tbody>
                    {org.programmes.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/operations/programmes/${p.id}`} className="link">
                            {p.name}
                          </Link>
                          <div className="text-xs text-slate-500">{[p.grades, p.academicYear].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td>
                          <ProgrammeBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {billing && invoices.length > 0 && (
            <div className="card p-0">
              <h2 className="flex justify-between px-5 pt-4 pb-2 font-semibold">
                Invoices
                {owed > 0 && <span className="text-sm font-medium text-slate-600">{formatMoney(owed)} still due</span>}
              </h2>
              <table className="table">
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link href={`/invoices/${i.id}`} className="link">
                          {i.number ?? "Draft"}
                        </Link>
                      </td>
                      <td>{formatDate(i.issueDate)}</td>
                      <td className="text-right">{formatMoney(i.total)}</td>
                      <td>
                        <Badge color={payStateColor[i.state]}>{payStateLabel[i.state]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card p-0">
            <h2 className="px-5 pt-4 pb-2 font-semibold">People</h2>
            {org.contacts.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-slate-500">No contacts yet.</p>
            ) : (
              <table className="table">
                <tbody>
                  {org.contacts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/crm/contacts/${c.id}`} className="link">
                          {c.name}
                        </Link>
                        <div className="text-xs text-slate-500">{c.designation}</div>
                      </td>
                      <td>{c.phone ?? "—"}</td>
                      <td>{c.email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-brand-600">Edit institution details</summary>
            <div className="mt-3">
              <OrganizationForm action={updateOrganization.bind(null, org.id)} org={org} users={users} />
            </div>
          </details>
        </div>
        <div className="space-y-6 xl:col-span-2">
          <ActivityPanel activities={org.activities} link={{ organizationId: org.id }} users={users} />
          <ContactForm action={createContact} organizations={orgs} users={users} defaultOrganizationId={org.id} compact />
        </div>
      </div>
    </>
  );
}
