import Link from "next/link";
import type { ReactNode } from "react";
import { requireOwner } from "@/lib/auth";
import { Badge, PageHeader } from "@/components/ui";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { AGE_BUCKETS } from "@/lib/purchase-math";
import { todayIST } from "@/lib/time";
import { readRange, rangeText } from "@/lib/dashboard-range";
import { ownerDashboard } from "./data";
import { Bars, CashFlowChart, Change, Metric, RangePicker, listHref } from "./ui";

export const metadata = { title: "Owner dashboard" };

// Lighter for money not yet due, darker the later it gets.
const AGE_COLORS = ["bg-brand-200", "bg-amber-300", "bg-amber-500", "bg-orange-600", "bg-red-700"];

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

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
      <div className="flex h-3 gap-0.5 rounded-full bg-slate-100">
        {values.map((v, i) =>
          v > 0 ? (
            <Link
              key={i}
              href={href}
              className={`dash-seg first:rounded-l-full last:rounded-r-full ${AGE_COLORS[i]}`}
              style={{ width: `${(v / total) * 100}%` }}
              data-tip={`${AGE_BUCKETS[i]}: ${formatINR(v)} (${Math.round((v / total) * 100)}%)`}
              aria-label={`${AGE_BUCKETS[i]}: ${formatINR(v)}`}
            />
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

/** One page for the owner: how the company is doing today, read from every module. The company owner only. */
export default async function OwnerDashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireOwner();
  const today = todayIST();
  const range = readRange(await searchParams, today);
  const d = await ownerDashboard(user, range);
  const { sales, moneyIn, moneyOut, cashFlow, sessions, projects, people, hiring, stock, helpdesk } = d;
  const period = rangeText(range.from, range.to);
  const before = rangeText(range.prevFrom, range.prevTo);
  const tipVs = (now: number, prev: number) => `${period}: ${formatINR(now)}\n${before}: ${formatINR(prev)}`;

  const alerts = [
    d.approvals > 0 && { text: `${d.approvals} waiting for approval`, href: "/approvals" },
    moneyIn.overdue > 0 && { text: `${formatINR(moneyIn.overdue)} overdue from schools`, href: "/invoices/dues" },
    moneyOut.overdue > 0 && { text: `${formatINR(moneyOut.overdue)} overdue to vendors`, href: "/purchases/payables" },
    sessions.logsDue > 0 && { text: `${sessions.logsDue} school ${plural(sessions.logsDue, "session")} not logged`, href: "/operations" },
    projects.late.length > 0 && { text: `${projects.late.length} ${plural(projects.late.length, "project")} past due date`, href: "/projects" },
    helpdesk.unassigned > 0 && { text: `${helpdesk.unassigned} helpdesk ${plural(helpdesk.unassigned, "request")} unassigned`, href: "/helpdesk" },
  ].filter((a): a is { text: string; href: string } => !!a);

  const sessionTile = (status: string, label: string, count: number, tone: string) => (
    <Link
      href={listHref("sessions", range, { status })}
      className={`dash-tile rounded-xl p-3 ${tone}`}
      data-tip={`${count} ${plural(count, "session")} ${label.toLowerCase()}, ${period}`}
    >
      <div className="text-2xl font-semibold">{count}</div>
      <div className="text-xs text-slate-600">{label}</div>
    </Link>
  );

  return (
    <>
      <PageHeader title="Owner dashboard" subtitle="Sales, money, schools, projects and people in one place. Pick the dates, then open any figure or bar to see the records behind it." />


      <RangePicker range={range} today={today} />

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

      <h2 className="dash-heading">{range.label === period ? period : `${range.label} · ${period}`}</h2>
      <div className="executive-stats mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label={`Deals won · ${sales.wonCount}`}
          value={formatINR(sales.won.now)}
          href={listHref("won", range)}
          tip={tipVs(sales.won.now, sales.won.before)}
          foot={<Change now={sales.won.now} before={sales.won.before} />}
        />
        <Metric
          label={`Invoiced, less credit notes · ${moneyIn.invoiceCount}`}
          value={formatINR(moneyIn.invoiced.now)}
          href={listHref("invoiced", range)}
          tip={tipVs(moneyIn.invoiced.now, moneyIn.invoiced.before)}
          foot={<Change now={moneyIn.invoiced.now} before={moneyIn.invoiced.before} />}
        />
        <Metric
          label="Received from schools"
          value={formatINR(moneyIn.received.now)}
          href={listHref("received", range)}
          tip={`${tipVs(moneyIn.received.now, moneyIn.received.before)}\nLess refunds; TDS not included`}
          foot={<Change now={moneyIn.received.now} before={moneyIn.received.before} />}
        />
        <Metric
          label="Paid out"
          value={formatINR(moneyOut.paid.now)}
          href={listHref("paid", range)}
          tip={`${tipVs(moneyOut.paid.now, moneyOut.paid.before)}\nVendors, salaries and expense claims`}
          foot={<Change now={moneyOut.paid.now} before={moneyOut.paid.before} rising="neutral" />}
        />
      </div>

      <h2 className="dash-heading">Now</h2>
      <div className="executive-stats mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          now
          label={`Open pipeline · ${sales.openCount} deals`}
          value={formatINR(sales.openValue)}
          href="/crm/deals"
          tip={sales.pipeline.map((p) => `${humanize(p.stage)}: ${p.count} · ${formatINR(p.value)}`).join("\n")}
        />
        <Metric
          now
          label="Schools still owe"
          value={formatINR(moneyIn.toCollect)}
          href="/invoices/dues"
          tip={`Overdue ${formatINR(moneyIn.overdue)}\nNot yet due ${formatINR(moneyIn.toCollect - moneyIn.overdue)}`}
        />
        <Metric
          now
          label="We owe vendors"
          value={formatINR(moneyOut.owed)}
          href="/purchases/payables"
          tip={`Overdue ${formatINR(moneyOut.overdue)}\nDue in the next 7 days ${formatINR(moneyOut.dueThisWeek)}`}
        />
        <Metric
          now
          label="Staff in today"
          value={`${people.inToday} / ${people.staff}`}
          href="/hr/attendance/register"
          tip={`Checked in ${people.inToday}\nOn leave ${people.onLeave.length}\nNot in yet ${Math.max(0, people.staff - people.inToday - people.onLeave.length)}`}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Money in and out" href={listHref("money", range)} link="See all records" className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Received from schools
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Paid out (vendors, salaries, expense claims)
            </span>
            <span className="text-slate-500">By {range.unit}</span>
          </div>
          <CashFlowChart bars={cashFlow} unit={range.unit} />
          <p className="mt-3 text-xs text-slate-500">
            {period}: {formatINR(moneyIn.received.now)} in, {formatINR(moneyOut.paid.now)} out. Point at a bar for its figures, or open it for the records.
            Salaries count in their payroll month once it is finalised.
          </p>
        </Card>

        <Card title="Sales pipeline" href="/crm/deals" link="Deals">
          <Bars
            rows={sales.pipeline.map((p) => ({
              label: `${humanize(p.stage)} · ${p.count}`,
              value: p.value,
              display: formatINR(p.value),
              href: listHref("pipeline", range, { stage: p.stage }),
              tip: `${p.count} open ${plural(p.count, "deal")} in ${humanize(p.stage).toLowerCase()}: ${formatINR(p.value)}`,
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
            <Row label={`Invoiced, less credit notes · ${moneyIn.invoiceCount}`} value={formatINR(moneyIn.invoiced.now)} href={listHref("invoiced", range)} />
            <Row label="Received" value={formatINR(moneyIn.received.now)} href={listHref("received", range)} />
            <Row label="Still to collect, now" value={formatINR(moneyIn.toCollect)} href="/invoices/dues" />
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
            <Row label="Paid out" value={formatINR(moneyOut.paid.now)} href={listHref("paid", range)} />
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

        <Card title="School sessions" href="/operations" link="Sessions">
          <div className="grid grid-cols-3 gap-2 text-center">
            {sessionTile("COMPLETED", "Held", sessions.held, "bg-brand-50 text-brand-800")}
            {sessionTile("MISSED", "Missed", sessions.missed, "bg-red-50 text-red-700")}
            {sessionTile("CANCELLED", "Cancelled", sessions.cancelled, "bg-slate-50 text-slate-700")}
          </div>
          <p className="mt-2 text-xs">
            <Change now={sessions.held} before={sessions.heldBefore} /> <span className="text-slate-500">in sessions held</span>
          </p>
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
