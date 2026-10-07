import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser, isAdmin } from "@/lib/auth";
import { pendingApprovals } from "@/lib/approvals";
import { formatTime } from "@/lib/attendance";
import { progress } from "@/lib/projects";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { addDays } from "@/lib/week";
import { decideLeave } from "../hr/actions";
import { decideCorrection } from "../hr/attendance/actions";
import { decideTimesheet } from "../timesheets/actions";
import { decideProject } from "../projects/actions";
import { decideStockRequest } from "../inventory/actions";
import { requestNo } from "@/lib/inventory";

export const metadata = { title: "Approvals" };

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-semibold">
        {title} <Badge color="amber">{count}</Badge>
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Decide({ action, sendBack }: { action: (formData: FormData) => Promise<void>; sendBack?: boolean }) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="note" placeholder={sendBack ? "What needs fixing?" : "Note (optional)"} className="input w-52" />
      <button name="decision" value="APPROVED" className="btn-primary btn-sm">
        Approve
      </button>
      <button name="decision" value="REJECTED" className="btn-danger btn-sm">
        {sendBack ? "Send back" : "Reject"}
      </button>
    </form>
  );
}

export default async function ApprovalsPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const { leave, corrections, timesheets, projects, stock, total } = await pendingApprovals(user);

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle={`${total} waiting for you · ${isAdmin(user) ? "everyone" : "your direct reports"}`}
        actions={
          <Link href="/hr/approvals" className="btn-secondary">
            Leave history
          </Link>
        }
      />
      {total === 0 && <Empty>Nothing waiting. You&apos;re all caught up.</Empty>}

      <Section title="Projects" count={projects.length}>
        {projects.map((p) => (
          <div key={p.id} className="card flex flex-wrap items-start justify-between gap-4">
            <div className="text-sm">
              <Link href={`/projects/${p.id}`} className="link">
                {p.name}
              </Link>
              <div className="mt-0.5 text-slate-500">
                Owner {p.owner.name} · {progress(p.tasks)}% of tasks done · asked {formatDateTime(p.updatedAt)}
              </div>
            </div>
            <Decide action={decideProject.bind(null, p.id)} sendBack />
          </div>
        ))}
      </Section>

      <Section title="Kit and part requests" count={stock.length}>
        {stock.map((r) => {
          const short = r.lines.filter((l) => l.item.onHand < l.quantity);
          return (
            <div key={r.id} className="card flex flex-wrap items-start justify-between gap-4">
              <div className="text-sm">
                <Link href={`/inventory/requests/${r.id}`} className="link">
                  {requestNo(r.number)}
                </Link>{" "}
                · <span className="font-medium">{r.requester.name}</span>
                {r.project && <> · {r.project.name}</>}
                {r.neededBy && <> · needed {formatDate(r.neededBy)}</>}
                <div className="mt-1">{r.lines.map((l) => `${l.quantity} ${l.item.unit} ${l.item.name}`).join(" · ")}</div>
                <div className="mt-0.5 text-slate-500">{r.purpose}</div>
                {short.length > 0 && (
                  <div className="mt-1 text-xs font-medium text-red-600">
                    Short in stock: {short.map((l) => `${l.item.name} (${l.item.onHand} left)`).join(", ")}
                  </div>
                )}
              </div>
              <Decide action={decideStockRequest.bind(null, r.id)} />
            </div>
          );
        })}
      </Section>

      <Section title="Timesheets" count={timesheets.length}>
        {timesheets.map((t) => {
          const total = t.entries.reduce((s, e) => s + Number(e.hours), 0);
          const byProject = new Map<string, number>();
          for (const e of t.entries) {
            const k = e.project?.name ?? "Other work";
            byProject.set(k, (byProject.get(k) ?? 0) + Number(e.hours));
          }
          return (
            <div key={t.id} className="card flex flex-wrap items-start justify-between gap-4">
              <div className="text-sm">
                <span className="font-medium">
                  {t.employee.firstName} {t.employee.lastName}
                </span>{" "}
                · {formatDate(t.weekStart)} – {formatDate(addDays(t.weekStart, 6))} · <b>{total} h</b>
                <div className="mt-1 text-slate-500">
                  {[...byProject].map(([name, h]) => `${name} ${h} h`).join(" · ")}
                </div>
              </div>
              <Decide action={decideTimesheet.bind(null, t.id)} />
            </div>
          );
        })}
      </Section>

      <Section title="Leave" count={leave.length}>
        {leave.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-start justify-between gap-4">
            <div className="text-sm">
              <Link href={`/hr/employees/${r.employee.id}`} className="link">
                {r.employee.firstName} {r.employee.lastName}
              </Link>
              <div className="mt-0.5">
                {r.leaveType.name} · {r.days} day(s) · {formatDate(r.startDate)}
                {r.endDate.getTime() !== r.startDate.getTime() && ` – ${formatDate(r.endDate)}`}
                {r.halfDay && " (half day)"}
              </div>
              <div className="mt-1 text-slate-500">{r.reason}</div>
            </div>
            <Decide action={decideLeave.bind(null, r.id)} />
          </div>
        ))}
      </Section>

      <Section title="Missed punch-outs" count={corrections.length}>
        {corrections.map((c) => (
          <div key={c.id} className="card flex flex-wrap items-center justify-between gap-4 text-sm">
            <div>
              <span className="font-medium">
                {c.employee.firstName} {c.employee.lastName}
              </span>{" "}
              · {formatDate(c.session.workDate)} · in {formatTime(c.session.checkIn)}, asks out at{" "}
              <b>{formatTime(c.requestedCheckOut)}</b>
              <div className="text-slate-500">“{c.reason}”</div>
            </div>
            <form action={decideCorrection.bind(null, c.id)} className="flex gap-2">
              <button name="decision" value="APPROVED" className="btn-primary btn-sm">
                Approve
              </button>
              <button name="decision" value="REJECTED" className="btn-secondary btn-sm">
                Reject
              </button>
            </form>
          </div>
        ))}
      </Section>
    </>
  );
}
