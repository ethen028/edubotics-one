import Link from "next/link";
import type { Prisma, TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { OPEN_TICKET_STATUSES, ticketNo } from "@/lib/helpdesk";
import { PriorityBadge } from "../projects/ui";
import { TicketStatusBadge } from "./ui";

export const metadata = { title: "Helpdesk" };

const STATUS_FILTERS = ["active", "OPEN", "IN_PROGRESS", "DONE", "CANCELLED", "any"] as const;
const STATUS_LABEL: Record<(typeof STATUS_FILTERS)[number], string> = {
  active: "Open or in progress",
  OPEN: "Not started",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Withdrawn",
  any: "All",
};

export default async function HelpdeskPage({ searchParams }: PageProps<"/helpdesk">) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const sp = (await searchParams) as Record<string, string | undefined>;

  const assignedCount = await db.helpdeskTicket.count({ where: { assigneeId: user.id } });
  const views = admin
    ? ([["all", "All requests"], ["unassigned", "Not assigned yet"], ["assigned", "Assigned to me"], ["mine", "My requests"]] as const)
    : ([["mine", "My requests"], ...(assignedCount > 0 ? [["assigned", "Assigned to me"] as const] : [])] as const);
  const view = views.find(([v]) => v === sp.view)?.[0] ?? views[0][0];
  const status = STATUS_FILTERS.find((s) => s === sp.status) ?? (view === "mine" ? "any" : "active");

  const where: Prisma.HelpdeskTicketWhereInput = {
    ...(view === "mine" ? { requesterId: user.id } : {}),
    ...(view === "assigned" ? { assigneeId: user.id } : {}),
    ...(view === "unassigned" ? { assigneeId: null } : {}),
    ...(status === "active"
      ? { status: { in: [...OPEN_TICKET_STATUSES] } }
      : status === "any"
        ? {}
        : { status: status as TicketStatus }),
  };
  const tickets = await db.helpdeskTicket.findMany({
    where,
    include: {
      requester: { select: { name: true } },
      assignee: { select: { name: true } },
      _count: { select: { comments: { where: { body: { not: null } } } } },
    },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const href = (v: string, s: string) => `?view=${v}&status=${s}`;

  return (
    <>
      <PageHeader
        title="Helpdesk"
        subtitle={
          admin
            ? "Requests from staff to the admin team. Assign each one, reply, and mark it done."
            : "Ask the admin team for equipment, an ID card, a repair, a letter or anything else."
        }
        actions={
          <Link href="/helpdesk/new" className="btn-primary">
            New request
          </Link>
        }
      />

      {views.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          {views.map(([v, label]) => (
            <Link key={v} href={href(v, v === "mine" ? "any" : "active")} className={view === v ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
              {label}
            </Link>
          ))}
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        {STATUS_FILTERS.map((s) => (
          <Link key={s} href={href(view, s)} className={status === s ? "font-semibold text-brand-700 underline underline-offset-4" : "text-slate-500 hover:text-slate-800"}>
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

      {tickets.length === 0 ? (
        <Empty>
          {view === "mine" ? (
            <>
              You haven&apos;t raised any requests yet.{" "}
              <Link href="/helpdesk/new" className="link">
                Raise one
              </Link>
            </>
          ) : (
            "Nothing here."
          )}
        </Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Request</th>
                {view !== "mine" && <th>Raised by</th>}
                <th>Priority</th>
                <th>Status</th>
                <th>Handled by</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td className="font-mono text-xs whitespace-nowrap">{ticketNo(t.number)}</td>
                  <td>
                    <Link href={`/helpdesk/${t.id}`} className="font-medium text-slate-900 hover:underline">
                      {t.title}
                    </Link>
                    {t.requesterId === user.id && t.requesterUnread && (
                      <span className="ml-2 rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950">Updated</span>
                    )}
                    <div className="text-xs text-slate-500">
                      {t.category}
                      {t._count.comments > 0 && ` · ${t._count.comments} ${t._count.comments === 1 ? "reply" : "replies"}`}
                    </div>
                  </td>
                  {view !== "mine" && <td className="whitespace-nowrap">{t.requester.name}</td>}
                  <td>
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td>
                    <TicketStatusBadge status={t.status} />
                  </td>
                  <td className="whitespace-nowrap">{t.assignee?.name ?? <span className="text-slate-400">Not yet</span>}</td>
                  <td className="text-xs whitespace-nowrap text-slate-500">{formatDateTime(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
