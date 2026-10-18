import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { backupProblem } from "@/lib/backups";
import { pendingApprovals } from "@/lib/approvals";
import { teamFlags } from "@/lib/checklists";
import { OPEN_TICKET_STATUSES } from "@/lib/helpdesk";
import { lowStockItems } from "@/lib/inventory";
import { needsLogWhere } from "@/lib/operations";
import { OPEN_PROJECT_STAGES } from "@/lib/projects";
import { settledByBill } from "@/lib/purchases";
import { round2 } from "@/lib/purchase-math";
import { ROLES } from "@/lib/permissions";
import { todayIST } from "@/lib/time";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";
import { invoicesWithBalance } from "../../invoices/data";
import { Attention, Line, Lines, Panel, plural } from "../role-ui";

export const metadata = { title: "Admin dashboard" };

const APPROVAL_KINDS = [
  ["leave", "Leave"],
  ["corrections", "Missed check-outs"],
  ["timesheets", "Timesheets"],
  ["claims", "Expense claims"],
  ["projects", "Projects to start"],
  ["stock", "Kit and part requests"],
  ["purchases", "Purchase orders"],
  ["resignations", "Resignations"],
] as const;

/**
 * Running the company day to day, for admins: what is waiting for a decision, billing and payroll to keep
 * moving, school delivery, stock, helpdesk, logins and backups. The profit and cash picture stays on the
 * owner dashboard.
 */
export default async function AdminDashboard() {
  const user = await requireUser(["ADMIN"]);
  const today = todayIST();
  const weekAhead = new Date(today.getTime() + 7 * 86_400_000);
  const month = today.toISOString().slice(0, 7);

  const [approvals, backup, overdue, openBills, payroll, lowStock, kitsLate, tickets, sessionsToday, logsDue, lateProjects, flags, users, owner, staff, checkedIn, claimsToPay] =
    await Promise.all([
      pendingApprovals(user),
      backupProblem(),
      invoicesWithBalance({ status: "ISSUED", dueDate: { lt: today } }),
      db.vendorBill.findMany({ where: { status: "OPEN", dueDate: { lte: weekAhead } }, select: { id: true, total: true, dueDate: true, vendor: { select: { name: true } } }, orderBy: { dueDate: "asc" } }),
      db.payrollRun.findUnique({ where: { month }, select: { status: true, _count: { select: { payslips: true } } } }),
      lowStockItems(),
      db.stockRequest.count({ where: { status: "ISSUED", returnBy: { lt: today } } }),
      db.helpdeskTicket.findMany({ where: { status: { in: [...OPEN_TICKET_STATUSES] } }, select: { assigneeId: true } }),
      db.programmeSession.count({ where: { date: today, status: { not: "CANCELLED" } } }),
      db.programmeSession.count({ where: needsLogWhere(today) }),
      db.project.findMany({ where: { stage: { in: [...OPEN_PROJECT_STAGES] }, onHold: false, dueDate: { lt: today } }, select: { id: true, name: true, dueDate: true }, orderBy: { dueDate: "asc" }, take: 5 }),
      teamFlags(user, today),
      db.user.groupBy({ by: ["role"], where: { active: true, closedAt: null }, _count: true }),
      db.user.findFirst({ where: { isOwner: true }, select: { name: true } }),
      db.employee.count({ where: { status: { in: ["ONBOARDING", "ACTIVE", "ON_NOTICE"] } } }),
      db.attendanceSession.findMany({ where: { workDate: today }, distinct: ["employeeId"], select: { employeeId: true } }),
      db.expenseClaim.count({ where: { status: "APPROVED", payslipId: null } }),
    ]);

  const overdueInvoices = overdue.filter((i) => i.balance > 0);
  const overdueTotal = overdueInvoices.reduce((s, i) => s + i.balance, 0);
  const settled = openBills.length ? await settledByBill(openBills.map((b) => b.id)) : new Map<string, number>();
  const billsDue = openBills.map((b) => ({ ...b, balance: round2(Number(b.total) - (settled.get(b.id) ?? 0)) })).filter((b) => b.balance > 0);
  const unassigned = tickets.filter((t) => !t.assigneeId).length;
  const slipping = flags.overdue.length + flags.missed.length;
  const roleCount = (role: string) => users.find((u) => u.role === role)?._count ?? 0;

  return (
    <>
      <PageHeader title="Admin dashboard" subtitle="Running the company today: decisions waiting, billing and payroll, delivery, stock, helpdesk, logins and backups." />

      <Attention
        items={[
          backup && { text: backup.text, href: "/admin/backups" },
          approvals.total > 0 && { text: `${plural(approvals.total, "request")} waiting for approval`, href: "/approvals" },
          overdueInvoices.length > 0 && { text: `${plural(overdueInvoices.length, "invoice")} overdue`, href: "/invoices/dues" },
          billsDue.length > 0 && { text: `${plural(billsDue.length, "vendor bill")} due this week`, href: "/purchases/payables" },
          logsDue > 0 && { text: `${plural(logsDue, "school session")} not logged`, href: "/operations" },
          unassigned > 0 && { text: `${plural(unassigned, "helpdesk request")} unassigned`, href: "/helpdesk" },
          lowStock.length > 0 && { text: `${plural(lowStock.length, "item")} low on stock`, href: "/inventory" },
        ]}
      />

      <div className="executive-stats mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Waiting for approval" value={approvals.total} href="/approvals" />
        <Stat label="Staff in today" value={`${checkedIn.length} / ${staff}`} href="/hr/attendance/register" />
        <Stat label={`School sessions today · ${logsDue} not logged`} value={sessionsToday} href="/operations" />
        <Stat label={`Helpdesk open · ${unassigned} unassigned`} value={tickets.length} href="/helpdesk" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Waiting for a decision" href="/approvals" link="Approvals">
          <Lines empty="Nothing waiting. All clear.">
            {APPROVAL_KINDS.filter(([key]) => approvals[key].length > 0).map(([key, label]) => (
              <Line key={key} label={label} value={approvals[key].length} href="/approvals" tone="amber" />
            ))}
          </Lines>
        </Panel>

        <Panel title="Billing and payroll" href="/invoices/dues" link="Payments due">
          <Lines empty="">
            {[
              <Line key="inv" label={`Invoices overdue · ${overdueInvoices.length}`} value={formatINR(overdueTotal)} href="/invoices/dues" tone={overdueInvoices.length ? "red" : undefined} />,
              <Line key="bill" label={`Vendor bills due in 7 days · ${billsDue.length}`} value={formatINR(billsDue.reduce((s, b) => s + b.balance, 0))} href="/purchases/payables" tone={billsDue.length ? "amber" : undefined} />,
              <Line
                key="pay"
                label={`Payroll for ${today.toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" })}`}
                value={payroll ? `${humanize(payroll.status)} · ${payroll._count.payslips} payslips` : "Not started"}
                href="/payroll"
                tone={payroll?.status === "PAID" ? "green" : undefined}
              />,
              <Line key="cl" label="Approved claims to pay outside payroll" value={claimsToPay} href="/expenses/team" />,
            ]}
          </Lines>
        </Panel>

        <Panel title="Delivery and projects" href="/operations" link="School sessions">
          <Lines empty="">
            {[
              <Line key="s" label="Sessions not logged" value={logsDue} href="/operations" tone={logsDue ? "amber" : undefined} />,
              <Line key="c" label="Checklists overdue or missed" value={slipping} href="/checklists/team" tone={slipping ? "red" : undefined} />,
              ...lateProjects.map((p) => <Line key={p.id} label={`Late: ${p.name}`} value={formatDate(p.dueDate)} href={`/projects/${p.id}`} tone="red" />),
            ]}
          </Lines>
        </Panel>

        <Panel title="Stock" href="/inventory">
          <Lines empty="Stock levels are fine.">
            {[
              kitsLate > 0 && <Line key="late" label="Kits and parts past their return date" value={kitsLate} href="/inventory/requests" tone="red" />,
              ...lowStock.slice(0, 5).map((i) => <Line key={i.id} label={i.name} value={`${i.onHand} ${i.unit} left`} href={`/inventory/${i.id}`} tone="amber" />),
            ]}
          </Lines>
        </Panel>

        <Panel title="Logins and roles" href="/admin/users" link="Users">
          <Lines empty="">
            {[
              <Line key="o" label="Company owner" value={owner?.name ?? "Not set"} href="/admin/users" tone={owner ? undefined : "red"} />,
              ...ROLES.map((r) => <Line key={r} label={humanize(r)} value={plural(roleCount(r), "person", "people")} href="/admin/roles" />),
            ]}
          </Lines>
        </Panel>

        <Panel title="Backups and setup" href="/admin/backups" link="Backups">
          <Lines empty="">
            {[
              <Line key="b" label="Backups" value={backup ? (backup.level === "red" ? "Needs attention" : "Check") : "Up to date"} href="/admin/backups" tone={backup ? backup.level : "green"} />,
              <Line key="l" label="Launch checklist" value="Open" href="/admin/launch" />,
              <Line key="h" label="Service health" value="Open" href="/admin/health" />,
              <Line key="a" label="Activity log" value="Open" href="/admin/activity" />,
            ]}
          </Lines>
        </Panel>
      </div>
    </>
  );
}
