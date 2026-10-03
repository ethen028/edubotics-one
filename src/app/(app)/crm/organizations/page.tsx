import Link from "next/link";
import type { OrgType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, Options, PageHeader } from "@/components/ui";
import { formatINR, humanize } from "@/lib/format";
import { ORG_TYPES, OPEN_STAGES } from "../constants";

export const metadata = { title: "Institutions" };

export default async function OrganizationsPage({ searchParams }: PageProps<"/crm/organizations">) {
  await requireUser();
  const { q = "", type = "" } = (await searchParams) as Record<string, string | undefined>;
  const where: Prisma.OrganizationWhereInput = {
    ...((ORG_TYPES as readonly string[]).includes(type) ? { type: type as OrgType } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { district: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const orgs = await db.organization.findMany({
    where,
    include: {
      owner: true,
      _count: { select: { contacts: true } },
      deals: { select: { stage: true, value: true } },
    },
    orderBy: { name: "asc" },
    take: 300,
  });

  return (
    <>
      <PageHeader
        title="Institutions"
        subtitle="Schools, colleges, companies and partners."
        actions={
          <Link href="/crm/organizations/new" className="btn-primary">
            Add institution
          </Link>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, city, district" className="input max-w-xs" />
        <select name="type" defaultValue={type} className="input w-auto">
          <option value="">All types</option>
          <Options values={ORG_TYPES} labels={humanize} />
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      {orgs.length === 0 ? (
        <Empty>No institutions yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Location</th>
                <th>Contacts</th>
                <th>Open deals</th>
                <th>Won</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => {
                const open = o.deals.filter((d) => (OPEN_STAGES as readonly string[]).includes(d.stage));
                const won = o.deals.filter((d) => d.stage === "WON").reduce((s, d) => s + Number(d.value), 0);
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/crm/organizations/${o.id}`} className="link">
                        {o.name}
                      </Link>
                      {o.board && <div className="text-xs text-slate-500">{o.board}</div>}
                    </td>
                    <td>
                      <Badge>{humanize(o.type)}</Badge>
                    </td>
                    <td>{[o.city, o.district].filter(Boolean).join(", ") || "—"}</td>
                    <td>{o._count.contacts}</td>
                    <td>{open.length ? `${open.length} · ${formatINR(open.reduce((s, d) => s + Number(d.value), 0))}` : "—"}</td>
                    <td>{won ? formatINR(won) : "—"}</td>
                    <td>{o.owner?.name ?? "—"}</td>
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
