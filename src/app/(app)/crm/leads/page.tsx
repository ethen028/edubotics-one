import Link from "next/link";
import type { LeadStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDate, humanize } from "@/lib/format";
import { leadStatusColor } from "../constants";

export const metadata = { title: "Leads" };

const TABS = ["OPEN", "NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED", "ALL"] as const;

export default async function LeadsPage({ searchParams }: PageProps<"/crm/leads">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const tab = (TABS as readonly string[]).includes(sp.status ?? "") ? sp.status! : "OPEN";
  const q = sp.q ?? "";
  const mine = sp.mine === "1";

  const where: Prisma.LeadWhereInput = {
    ...(tab === "OPEN"
      ? { status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } }
      : tab === "ALL"
        ? {}
        : { status: tab as LeadStatus }),
    ...(mine ? { ownerId: user.id } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { organizationName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const leads = await db.lead.findMany({ where, include: { owner: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const qs = (s: string) => `?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}${mine ? "&mine=1" : ""}`;

  return (
    <>
      <PageHeader
        title="Leads"
        eyebrow="Customer relationships"
        icon="crm"
        subtitle="Enquiries that haven't become deals yet."
        actions={
          <Link href="/crm/leads/new" className="btn-primary">
            Add lead
          </Link>
        }
      />
      <section className="filter-surface mb-6" aria-label="Lead filters">
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t}
            href={qs(t)}
            aria-current={t === tab ? "page" : undefined}
            className={`filter-chip ${t === tab ? "filter-chip-active" : ""}`}
          >
            {humanize(t)}
          </Link>
        ))}
      </div>
      <form className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="status" value={tab} />
        <input aria-label="Search leads" name="q" defaultValue={q} placeholder="Search name, institution, phone, city" className="input max-w-xs" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="mine" value="1" defaultChecked={mine} /> Only mine
        </label>
        <button className="btn-secondary">Filter</button>
      </form>
      </section>
      <div className="directory-heading"><h2>Lead directory</h2><span>{leads.length === 200 ? "Showing up to 200 matches" : `${leads.length} matching ${leads.length === 1 ? "lead" : "leads"}`}</span></div>
      {leads.length === 0 ? (
        <Empty>No leads here.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <caption className="sr-only">Leads matching the selected filters</caption>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Interest</th>
                <th>Source</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/crm/leads/${l.id}`} className="link">
                      {l.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {[l.organizationName, l.city].filter(Boolean).join(" · ")}
                      {l.phone && <> · {l.phone}</>}
                    </div>
                  </td>
                  <td className="max-w-56 truncate">{l.interest ?? "—"}</td>
                  <td>{humanize(l.source)}</td>
                  <td>
                    <Badge color={leadStatusColor[l.status]}>{humanize(l.status)}</Badge>
                  </td>
                  <td>{l.owner?.name ?? "—"}</td>
                  <td>{formatDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
