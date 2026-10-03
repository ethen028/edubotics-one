import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { startOfTomorrowIST } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDateTime, humanize } from "@/lib/format";
import { toggleActivity } from "../actions";

export const metadata = { title: "Follow-ups" };

type Row = Prisma.ActivityGetPayload<{
  include: { assignee: true; lead: true; deal: true; organization: true; contact: true };
}>;

function Related({ a }: { a: Row }) {
  if (a.deal) return <Link className="link" href={`/crm/deals/${a.deal.id}`}>{a.deal.title}</Link>;
  if (a.lead) return <Link className="link" href={`/crm/leads/${a.lead.id}`}>{a.lead.name}</Link>;
  if (a.contact) return <Link className="link" href={`/crm/contacts/${a.contact.id}`}>{a.contact.name}</Link>;
  if (a.organization) return <Link className="link" href={`/crm/organizations/${a.organization.id}`}>{a.organization.name}</Link>;
  return <span className="text-slate-400">—</span>;
}

function Section({ title, rows, color }: { title: string; rows: Row[]; color: "red" | "amber" | "gray" }) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        {title} <Badge color={color}>{rows.length}</Badge>
      </h2>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="w-8">
                  <form action={toggleActivity.bind(null, a.id)}>
                    <button title="Mark as done" className="h-4 w-4 rounded border border-slate-400 bg-white hover:border-emerald-500" />
                  </form>
                </td>
                <td>
                  <Badge>{humanize(a.type)}</Badge> <span className="font-medium">{a.subject}</span>
                  {a.body && <div className="mt-0.5 text-xs text-slate-500">{a.body}</div>}
                </td>
                <td>
                  <Related a={a} />
                </td>
                <td className="whitespace-nowrap">{formatDateTime(a.dueAt)}</td>
                <td>{a.assignee?.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ActivitiesPage({ searchParams }: PageProps<"/crm/activities">) {
  const user = await requireUser();
  const { all } = (await searchParams) as Record<string, string | undefined>;
  const everyone = all === "1";
  const rows = await db.activity.findMany({
    where: { done: false, dueAt: { not: null }, ...(everyone ? {} : { assigneeId: user.id }) },
    include: { assignee: true, lead: true, deal: true, organization: true, contact: true },
    orderBy: { dueAt: "asc" },
    take: 300,
  });

  // "Today" in India time.
  const tomorrow = startOfTomorrowIST();
  const now = new Date();
  const overdue = rows.filter((a) => a.dueAt! < now);
  const today = rows.filter((a) => a.dueAt! >= now && a.dueAt! < tomorrow);
  const later = rows.filter((a) => a.dueAt! >= tomorrow);

  return (
    <>
      <PageHeader
        title="Follow-ups"
        subtitle={everyone ? "Everyone's open follow-ups" : "Your open follow-ups. Schedule them from any lead, deal, institution or contact."}
        actions={
          <Link href={everyone ? "?" : "?all=1"} className="btn-secondary">
            {everyone ? "Only mine" : "Show everyone's"}
          </Link>
        }
      />
      {rows.length === 0 ? (
        <Empty>Nothing scheduled. Nice.</Empty>
      ) : (
        <>
          <Section title="Overdue" rows={overdue} color="red" />
          <Section title="Today" rows={today} color="amber" />
          <Section title="Upcoming" rows={later} color="gray" />
        </>
      )}
    </>
  );
}
