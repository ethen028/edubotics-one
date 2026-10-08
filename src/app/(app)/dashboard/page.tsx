import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { Badge, Stat } from "@/components/ui";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { AGE_BUCKETS } from "@/lib/purchase-math";
import { ownerDashboard } from "./data";

export const metadata = { title: "Owner dashboard" };

// Lighter for money not yet due, darker the later it gets.
const AGE_COLORS = ["bg-brand-200", "bg-amber-300", "bg-amber-500", "bg-orange-600", "bg-red-700"];

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/** Rupees in lakhs for chart labels: ₹1.2L, ₹45k. */
function short(n: number) {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n >= 1_000_000 ? 0 : 1)}L`;
  if (n >= 1000) return `₹${Math.round(n / 1000)}k`;
  return `₹${Math.round(n)}`;
}

function Card({ title, href, link = "Open", children, className = "" }: { title: string; href: string; link?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <Link href={href} className="link shrink-0 text-sm">
          {link}
        </Link>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, href, tone }: { label: ReactNode; value: ReactNode; href?: string; tone?: "red" | "amber" }) {
  const color = tone === "red" ? "font-medium text-red-600" : tone === "amber" ? "font-medium text-amber-700" : "text-slate-900";
  return (
    <li className="flex justify-between gap-3 py-1.5">
      {href ? (
        <Link href={href} className="truncate text-slate-600 hover:underline">
          {label}
        </Link>
      ) : (
        <span className="truncate text-slate-600">{label}</span>
      )}
      <span className={`shrink-0 tabular-nums ${color}`}>{value}</span>
    </li>
  );
}

/** One bar split into ageing buckets, with the amounts listed under it. */
function Ageing({ values, href }: { values: number[]; href: string }) {
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return <p className="text-sm text-slate-500">Nothing outstanding.</p>;
  return (
    <>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100">
        {values.map((v, i) =>
          v > 0 ? (
            <div key={i} className={AGE_COLORS[i]} style={{ width: `${(v / total) * 100}%` }} title={`${AGE_BUCKETS[i]}: ${formatINR(v)}`} />
          ) : null,
        )}
      </div>
      <ul className="mt-2 text-sm">
        {values.map((v, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-0.5">
            <Link href={href} className="flex items-center gap-2 text-slate-600 hover:underline">
              <span className={`h-2.5 w-2.5 rounded-sm ${AGE_COLORS[i]}`} />
              {AGE_BUCKETS[i]}
            </Link>
            <span className={`tabular-nums ${v > 0 && i >= 2 ? "font-medium text-red-600" : "text-slate-900"}`}>{formatINR(v)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Horizontal bars for a few labelled counts or amounts. */
function Bars({ rows }: { rows: { label: string; value: number; display: string; href?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-2">
            {r.href ? (
              <Link href={r.href} className="text-slate-600 hover:underline">
                {r.label}
              </Link>
            ) : (
              <span className="text-slate-600">{r.label}</span>
            )}
            <span className="tabular-nums text-slate-900">{r.display}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One page for the owner: how the company is doing today, read from every module. Admins only. */
export default async function OwnerDashboardPage() {
  const user = await requireUser(["ADMIN"]);
  const d = await ownerDashboard(user);
  const { sales, moneyIn, moneyOut, cashFlow, sessions, projects, people, hiring, stock, helpdesk } = d;
  const flowMax = Math.max(1, ...cashFlow.flatMap((m) => [m.in, m.out]));
  const thisMonth = cashFlow[cashFlow.length - 1];

  const alerts = [
    d.approvals > 0 && { text: `${d.approvals} waiting for approval`, href: "/approvals" },
    moneyIn.overdue > 0 && { text: `${formatINR(moneyIn.overdue)} overdue from schools`, href: "/invoices/dues" },
    moneyOut.overdue > 0 && { text: `${formatINR(moneyOut.overdue)} overdue to vendors`, href: "/purchases/payables" },
    sessions.logsDue > 0 && { text: `${sessions.logsDue} school ${plural(sessions.logsDue, "session")} not logged`, href: "/operations" },
    projects.late.length > 0 && { text: `${projects.late.length} ${plural(projects.late.length, "project")} past due date`, href: "/projects" },
    helpdesk.unassigned > 0 && { text: `${helpdesk.unassigned} helpdesk ${plural(helpdesk.unassigned, "request")} unassigned`, href: "/helpdesk" },
  ].filter((a): a is { text: string; href: string } => !!a);

  return (
    <>
      <div className="mb-6">
        <div className="text-xs font-semibold tracking-wider text-brand-700 uppercase">
          {d.today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Owner dashboard</h1>
        <p className="text-sm text-slate-500">Sales, money, schools, projects and people in one place. Every number opens its page.</p>
      </div>

      {alerts.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {alerts.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 hover:border-amber-400"
            >
              {a.text}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label={`Open pipeline · ${sales.openCount} deals`} value={formatINR(sales.openValue)} href="/crm/deals" />
        <Stat label={`Won this month · ${sales.wonCountThisMonth}`} value={formatINR(sales.wonThisMonth)} href="/crm/deals" />
        <Stat label="Received this month" value={formatINR(moneyIn.receivedThisMonth)} href="/invoices" />
        <Stat label="Schools still owe" value={formatINR(moneyIn.toCollect)} href="/invoices/dues" />
        <Stat label="We owe vendors" value={formatINR(moneyOut.owed)} href="/purchases/payables" />
        <Stat label="Staff in today" value={`${people.inToday} / ${people.staff}`} href="/hr/attendance/register" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Money in and out, last 6 months" href="/invoices" link="Invoices" className="lg:col-span-2">
          <div className="mb-3 flex gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Received from schools
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Paid out (vendors, salaries, expense claims)
            </span>
          </div>
          <div className="flex h-44 items-end gap-2 border-b border-slate-200 sm:gap-4">
            {cashFlow.map((m) => (
              <div
                key={m.key}
                className="flex h-full flex-1 items-end justify-center gap-0.5"
                title={`${m.label}: in ${formatINR(m.in)}, out ${formatINR(m.out)} (vendors ${formatINR(m.vendors)}, salaries ${formatINR(m.salaries)}, claims ${formatINR(m.claims)})`}
              >
                <div className="w-1/3 max-w-6 rounded-t bg-brand-600" style={{ height: `${(m.in / flowMax) * 100}%` }} />
                <div className="w-1/3 max-w-6 rounded-t bg-amber-400" style={{ height: `${(m.out / flowMax) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-2 text-center text-[11px] sm:gap-4">
            {cashFlow.map((m) => (
              <div key={m.key} className="min-w-0 flex-1">
                <div className="font-medium text-slate-700">{m.label}</div>
                <div className="text-brand-700 tabular-nums">{short(m.in)}</div>
                <div className="text-amber-800 tabular-nums">{short(m.out)}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            This month: {formatINR(thisMonth.in)} in, {formatINR(thisMonth.out)} out. Salaries count once the month&apos;s payroll is finalised.
          </p>
        </Card>

        <Card title="Sales pipeline" href="/crm/deals" link="Deals">
          <Bars
            rows={sales.pipeline.map((p) => ({
              label: `${humanize(p.stage)} · ${p.count}`,
              value: p.value,
              display: formatINR(p.value),
              href: "/crm/deals",
            }))}
          />
          <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">Expected to close in 30 days</h3>
          {sales.closingSoon.length === 0 ? (
            <p className="text-sm text-slate-500">No open deals due to close.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {sales.closingSoon.map((deal) => (
                <Row
                  key={deal.id}
                  href={`/crm/deals/${deal.id}`}
                  label={
                    <>
                      {deal.title}
                      {deal.organization && <span className="text-slate-400"> · {deal.organization.name}</span>}
                    </>
                  }
                  value={formatINR(deal.value)}
                  tone={deal.expectedClose && deal.expectedClose < d.today ? "amber" : undefined}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Money in" href="/invoices/dues" link="Payments due">
          <ul className="mb-3 divide-y divide-slate-100 text-sm">
            <Row label={`Invoiced this month · ${moneyIn.invoicesThisMonth}`} value={formatINR(moneyIn.invoicedThisMonth)} href="/invoices" />
            <Row label="Received this month" value={formatINR(moneyIn.receivedThisMonth)} href="/invoices" />
            <Row label="Still to collect" value={formatINR(moneyIn.toCollect)} href="/invoices/dues" />
          </ul>
          <Ageing values={moneyIn.ageing} href="/invoices/dues" />
          {moneyIn.topOwing.length > 0 && (
            <>
              <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">Schools owing most</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {moneyIn.topOwing.map(([name, amount]) => (
                  <Row key={name} label={name} value={formatINR(amount)} href="/invoices/dues" />
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Money out" href="/purchases/payables" link="Payables">
          <ul className="mb-3 divide-y divide-slate-100 text-sm">
            <Row label="Vendor bills due in 7 days" value={formatINR(moneyOut.dueThisWeek)} href="/purchases/payables" />
            <Row label="Paid out this month" value={formatINR(thisMonth.out)} />
          </ul>
          <Ageing values={moneyOut.ageing} href="/purchases/payables" />
          <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">Staff costs</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            <Row
              label={`Expense claims to approve · ${moneyOut.claimsWaiting.count}`}
              value={formatINR(moneyOut.claimsWaiting.amount)}
              href="/approvals"
              tone={moneyOut.claimsWaiting.count ? "amber" : undefined}
            />
            <Row
              label={`Approved claims to pay · ${moneyOut.claimsToPay.count}`}
              value={formatINR(moneyOut.claimsToPay.amount)}
              href="/expenses/team?month=all&status=APPROVED"
            />
            {moneyOut.latestRun ? (
              <Row
                label={
                  <>
                    Payroll {moneyOut.latestRun.month} · {moneyOut.latestRun.people} people{" "}
                    <Badge color={moneyOut.latestRun.status === "PAID" ? "green" : moneyOut.latestRun.status === "FINALIZED" ? "blue" : "amber"}>
                      {humanize(moneyOut.latestRun.status)}
                    </Badge>
                  </>
                }
                value={formatINR(moneyOut.latestRun.net)}
                href={`/payroll/${moneyOut.latestRun.month}`}
              />
            ) : (
              <Row label="Payroll" value="No run yet" href="/payroll" />
            )}
          </ul>
        </Card>

        <Card title="School sessions this month" href="/operations" link="Sessions">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-brand-50 p-3">
              <div className="text-2xl font-semibold text-brand-800">{sessions.held}</div>
              <div className="text-xs text-slate-600">Held</div>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <div className="text-2xl font-semibold text-red-700">{sessions.missed}</div>
              <div className="text-xs text-slate-600">Missed</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-2xl font-semibold text-slate-700">{sessions.cancelled}</div>
              <div className="text-xs text-slate-600">Cancelled</div>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            <Row label="Sessions today" value={sessions.today} href="/operations" />
            <Row label="Past sessions not logged" value={sessions.logsDue} href="/operations" tone={sessions.logsDue ? "red" : undefined} />
            <Row label="Delivery reports" value="Open" href="/operations/reports" />
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Projects" href="/projects" link="All">
          <Bars
            rows={projects.byStage
              .filter((s) => s.count > 0)
              .map((s) => ({ label: humanize(s.stage), value: s.count, display: String(s.count), href: "/projects" }))}
          />
          {projects.open === 0 && <p className="text-sm text-slate-500">No open projects.</p>}
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            <Row label="On hold" value={projects.onHold} href="/projects" />
            <Row label="Past due date" value={projects.late.length} href="/projects" tone={projects.late.length ? "red" : undefined} />
          </ul>
          {projects.late.length > 0 && (
            <ul className="mt-1 space-y-1 text-sm">
              {projects.late.slice(0, 4).map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <Link href={`/projects/${p.id}`} className="truncate hover:underline">
                    {p.name}
                  </Link>
                  <span className="shrink-0 text-xs text-red-600">{formatDate(p.dueDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="People today" href="/hr/attendance/register" link="Register">
          <ul className="divide-y divide-slate-100 text-sm">
            <Row label="Staff" value={people.staff} href="/hr/employees" />
            <Row label="Checked in" value={people.inToday} href="/hr/attendance/register" />
            <Row label="On leave" value={people.onLeave.length} href="/hr/employees" />
            <Row
              label="Not checked in yet"
              value={Math.max(0, people.staff - people.inToday - people.onLeave.length)}
              href="/hr/attendance/register"
            />
            <Row label="Leave requests waiting" value={people.leavePending} href="/approvals" tone={people.leavePending ? "amber" : undefined} />
          </ul>
          {people.onLeave.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-sm">
              {people.onLeave.map((l) => (
                <li key={l.id}>
                  <Link href={`/hr/employees/${l.employee.id}`} className="hover:underline">
                    {l.employee.firstName} {l.employee.lastName}
                  </Link>{" "}
                  <span className="text-slate-500">· {l.leaveType.code}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Hiring" href="/recruitment" link="Recruitment">
          <ul className="mb-3 divide-y divide-slate-100 text-sm">
            <Row label={`Open jobs · ${hiring.jobs}`} value={`${hiring.openings} to hire`} href="/recruitment" />
            <Row label="Interviews in the next 7 days" value={hiring.interviewsThisWeek} href="/recruitment/interviews" />
            <Row label="Offers waiting for an answer" value={hiring.offersOut} href="/recruitment/candidates?stage=OFFER" />
          </ul>
          <Bars
            rows={hiring.candidates.map((c) => ({
              label: humanize(c.stage),
              value: c.count,
              display: String(c.count),
              href: `/recruitment/candidates?stage=${c.stage}`,
            }))}
          />
        </Card>

        <Card title="Stock and helpdesk" href="/inventory?view=low" link="Low stock">
          <ul className="divide-y divide-slate-100 text-sm">
            <Row label="Items low or out" value={stock.low.length} href="/inventory?view=low" tone={stock.low.length ? "amber" : undefined} />
            <Row label="Kits overdue for return" value={stock.kitsLate} href="/inventory/requests?status=ISSUED" tone={stock.kitsLate ? "red" : undefined} />
          </ul>
          {stock.low.length > 0 && (
            <ul className="mt-1 mb-2 space-y-0.5 text-sm">
              {stock.low.slice(0, 4).map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <Link href={`/inventory/${i.id}`} className="truncate hover:underline">
                    {i.name}
                  </Link>
                  <span className={`shrink-0 ${i.onHand === 0 ? "font-medium text-red-600" : "text-amber-700"}`}>
                    {i.onHand} {i.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
            <Row label="Open helpdesk requests" value={helpdesk.open} href="/helpdesk" />
            <Row label="Not assigned" value={helpdesk.unassigned} href="/helpdesk" tone={helpdesk.unassigned ? "amber" : undefined} />
            <Row label="High priority" value={helpdesk.urgent} href="/helpdesk" tone={helpdesk.urgent ? "red" : undefined} />
          </ul>
        </Card>
      </div>
    </>
  );
}
