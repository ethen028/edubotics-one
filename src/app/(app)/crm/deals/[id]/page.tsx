import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Badge, PageHeader } from "@/components/ui";
import { formatINR, humanize } from "@/lib/format";
import { DealForm } from "../../forms";
import { deleteDeal, updateDeal } from "../../actions";
import { activeUsers, orgOptions } from "../../data";
import { ActivityPanel, activityInclude } from "../../activity-panel";
import { dealStageColor } from "../../constants";

export default async function DealPage({ params }: PageProps<"/crm/deals/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const deal = await db.deal.findUnique({
    where: { id },
    include: {
      organization: true,
      contact: true,
      lead: true,
      projects: { select: { id: true, name: true, stage: true } },
      invoices: {
        where: { status: { not: "CANCELLED" } },
        select: { id: true, number: true, subtotal: true },
        orderBy: { issueDate: "asc" },
      },
      activities: { include: activityInclude, orderBy: { createdAt: "desc" } },
    },
  });
  if (!deal) notFound();
  const [users, organizations, contacts] = await Promise.all([
    activeUsers(),
    orgOptions(),
    db.contact.findMany({
      where: deal.organizationId ? { organizationId: deal.organizationId } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={deal.title}
        subtitle={
          <>
            {formatINR(deal.value)} · <Badge color={dealStageColor[deal.stage]}>{humanize(deal.stage)}</Badge>
            {deal.organization && (
              <>
                {" · "}
                <Link href={`/crm/organizations/${deal.organization.id}`} className="link">
                  {deal.organization.name}
                </Link>
              </>
            )}
            {deal.contact && (
              <>
                {" · "}
                <Link href={`/crm/contacts/${deal.contact.id}`} className="link">
                  {deal.contact.name}
                </Link>
                {deal.contact.phone && ` (${deal.contact.phone})`}
              </>
            )}
          </>
        }
        actions={
          <>
            <Link href="/crm/deals" className="btn-secondary">
              Pipeline
            </Link>
            {deal.stage === "WON" && isManagerOrAdmin(user) && (
              <Link href={`/projects/new?deal=${deal.id}`} className="btn-primary">
                Start delivery project
              </Link>
            )}
            {deal.stage === "WON" && isManagerOrAdmin(user) && (
              <Link href={`/invoices/new?deal=${deal.id}`} className="btn-secondary">
                Create invoice
              </Link>
            )}
            {isAdmin(user) && (
              <form action={deleteDeal.bind(null, deal.id)}>
                <button className="btn-danger">Delete</button>
              </form>
            )}
          </>
        }
      />
      {deal.lead && (
        <p className="-mt-4 mb-4 text-sm text-slate-500">
          From lead{" "}
          <Link href={`/crm/leads/${deal.lead.id}`} className="link">
            {deal.lead.name}
          </Link>
        </p>
      )}
      {deal.projects.length > 0 && (
        <p className="-mt-2 mb-4 text-sm text-slate-500">
          Delivery:{" "}
          {deal.projects.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link href={`/projects/${p.id}`} className="link">
                {p.name}
              </Link>{" "}
              ({humanize(p.stage)})
            </span>
          ))}
        </p>
      )}
      {isManagerOrAdmin(user) && deal.invoices.length > 0 && (
        <p className="-mt-2 mb-4 text-sm text-slate-500">
          Billed {formatINR(deal.invoices.reduce((n, i) => n + Number(i.subtotal), 0))} of {formatINR(deal.value)} before GST:{" "}
          {deal.invoices.map((i, k) => (
            <span key={i.id}>
              {k > 0 && ", "}
              <Link href={`/invoices/${i.id}`} className="link">
                {i.number ?? "draft"}
              </Link>
            </span>
          ))}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <DealForm action={updateDeal.bind(null, deal.id)} deal={deal} organizations={organizations} contacts={contacts} users={users} />
        </div>
        <div className="xl:col-span-2">
          <ActivityPanel
            activities={deal.activities}
            link={{ dealId: deal.id, organizationId: deal.organizationId ?? undefined }}
            users={users}
          />
        </div>
      </div>
    </>
  );
}
