import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, type CurrentUser } from "@/lib/auth";
import { OPEN_TICKET_STATUSES, ticketNo } from "@/lib/helpdesk";
import { TicketStatusBadge } from "./ui";

/** Home: updates on your own requests, and for admins or handlers, what's waiting on them. */
export async function HelpdeskHomeCard({ user }: { user: CurrentUser }) {
  const admin = isAdmin(user);
  const [updated, mineOpen, toHandle, unassigned] = await Promise.all([
    db.helpdeskTicket.findMany({
      where: { requesterId: user.id, requesterUnread: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    db.helpdeskTicket.findMany({
      where: { requesterId: user.id, requesterUnread: false, status: { in: [...OPEN_TICKET_STATUSES] } },
      orderBy: { updatedAt: "desc" },
      take: 3,
    }),
    db.helpdeskTicket.findMany({
      where: { assigneeId: user.id, status: { in: [...OPEN_TICKET_STATUSES] } },
      include: { requester: { select: { name: true } } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 5,
    }),
    admin ? db.helpdeskTicket.count({ where: { status: "OPEN", assigneeId: null } }) : 0,
  ]);

  return (
    <>
      {updated.length > 0 && (
        <section className="card border-amber-300 bg-amber-50">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-amber-950">Updates on your requests</h2>
            <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950">{updated.length}</span>
          </div>
          <ul className="space-y-2 text-sm">
            {updated.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <Link href={`/helpdesk/${t.id}`} className="min-w-0 truncate hover:underline">
                  <span className="font-mono text-xs text-slate-500">{ticketNo(t.number)}</span> {t.title}
                </Link>
                <TicketStatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {(admin || toHandle.length > 0) && (
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Helpdesk</h2>
            <Link href={admin ? "/helpdesk" : "/helpdesk?view=assigned"} className="link text-sm">
              Open
            </Link>
          </div>
          {admin && (
            <Link href="/helpdesk?view=unassigned&status=OPEN" className="mb-2 block text-sm hover:underline">
              {unassigned === 0 ? (
                <span className="text-slate-500">No new requests waiting to be assigned.</span>
              ) : (
                <>
                  <b className="text-amber-700">{unassigned}</b> new {unassigned === 1 ? "request" : "requests"} not assigned yet
                </>
              )}
            </Link>
          )}
          {toHandle.length > 0 && (
            <>
              <div className="mb-1 text-xs font-medium text-slate-500">Assigned to you</div>
              <ul className="space-y-1.5 text-sm">
                {toHandle.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <Link href={`/helpdesk/${t.id}`} className="min-w-0 truncate hover:underline">
                      {t.title} <span className="text-slate-500">· {t.requester.name.split(" ")[0]}</span>
                    </Link>
                    {t.priority === "HIGH" ? (
                      <span className="text-xs font-semibold text-red-600">High</span>
                    ) : (
                      <TicketStatusBadge status={t.status} />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Need something?</h2>
          <Link href="/helpdesk/new" className="btn-secondary btn-sm">
            New request
          </Link>
        </div>
        {mineOpen.length === 0 ? (
          <p className="text-sm text-slate-500">Ask the admin team for equipment, an ID card, a repair or a letter.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {mineOpen.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <Link href={`/helpdesk/${t.id}`} className="min-w-0 truncate hover:underline">
                  {t.title}
                </Link>
                <TicketStatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
