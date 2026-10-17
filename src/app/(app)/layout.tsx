import { requireUser, isAdmin, isManagerOrAdmin } from "@/lib/auth";
import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { Sidebar } from "@/components/sidebar";
import { Icon } from "@/components/icons";
import { humanize } from "@/lib/format";
import { pendingApprovals } from "@/lib/approvals";
import { lowStockItems } from "@/lib/inventory";
import { db } from "@/lib/db";
import { myPendingAcks } from "@/lib/notices";
import { helpdeskCounts } from "@/lib/helpdesk";
import { myReviewTodos } from "@/lib/reviews";
import { newOnlineApplications } from "@/lib/careers";
import { myChecklistsNow } from "@/lib/checklists";
import { unreadCount } from "@/lib/notifications";
import { logout } from "../actions";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [approvals, lowStock, myInterviews, toAcknowledge, helpdesk, reviewTodos, onlineApplications, checklists, inbox] = await Promise.all([
    pendingApprovals(user),
    isAdmin(user) ? lowStockItems() : [],
    db.interview.count({ where: { interviewerId: user.id, status: "SCHEDULED" } }),
    myPendingAcks(user),
    helpdeskCounts(user),
    myReviewTodos(user),
    isManagerOrAdmin(user) ? newOnlineApplications() : 0,
    myChecklistsNow(user.id),
    unreadCount(user.id),
  ]);
  const overdueChecklists = checklists.open.some((e) => e.status === "OVERDUE");
  // Shortcuts in the bar along the top: only the things this person has to act on.
  const waiting = [
    { n: approvals.total, label: `${approvals.total} to approve`, href: "/approvals" },
    { n: checklists.open.length, label: `${checklists.open.length} checklist${checklists.open.length === 1 ? "" : "s"} to tick`, href: "/checklists" },
    { n: toAcknowledge.length, label: `${toAcknowledge.length} notice${toAcknowledge.length === 1 ? "" : "s"} to read`, href: "/notices" },
    { n: reviewTodos.length, label: `${reviewTodos.length} review${reviewTodos.length === 1 ? "" : "s"} to do`, href: "/hr/reviews" },
    { n: myInterviews, label: `${myInterviews} interview${myInterviews === 1 ? "" : "s"}`, href: "/recruitment/interviews" },
  ].filter((w) => w.n > 0);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        header={
          <div className="flex items-center gap-2">
            <div className="brand-mark">E</div>
            <div className="leading-tight">
              <div className="font-display text-sm font-semibold">Edubotics One</div>
              <div className="sidebar-muted text-[11px]">Global Operations</div>
            </div>
          </div>
        }
      >
        <nav className="flex-1 space-y-4 overflow-y-auto">
          <div className="space-y-0.5">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/inbox">
              <span className="flex items-center justify-between">
                Inbox
                {inbox > 0 && (
                  <span className="nav-badge" title="Unread messages">
                    {inbox}
                  </span>
                )}
              </span>
            </NavLink>
            {isAdmin(user) && <NavLink href="/dashboard">Owner dashboard</NavLink>}
            <NavLink href="/notices">
              <span className="flex items-center justify-between">
                Notice board
                {toAcknowledge.length > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950">
                    {toAcknowledge.length}
                  </span>
                )}
              </span>
            </NavLink>
          </div>
          <div className="space-y-0.5">
            <div className="nav-section">Work</div>
            <NavLink href="/work">My work</NavLink>
            <NavLink href="/projects/pulse">Daily pulse</NavLink>
            <NavLink href="/projects" except={["/projects/pulse"]}>
              Projects
            </NavLink>
            <NavLink href="/timesheets">Timesheet</NavLink>
            <NavLink href="/checklists">
              <span className="flex items-center justify-between">
                Checklists
                {checklists.open.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[11px] font-semibold ${overdueChecklists ? "bg-red-400 text-red-950" : "bg-amber-400 text-amber-950"}`}
                    title={overdueChecklists ? "Some are overdue" : "To tick off"}
                  >
                    {checklists.open.length}
                  </span>
                )}
              </span>
            </NavLink>
            <NavLink href="/expenses" exact>
              Expenses
            </NavLink>
            {isManagerOrAdmin(user) && <NavLink href="/expenses/team">Team expenses</NavLink>}
            <NavLink href="/helpdesk">
              <span className="flex items-center justify-between">
                Helpdesk
                {helpdesk.total > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950">{helpdesk.total}</span>
                )}
              </span>
            </NavLink>
            {isManagerOrAdmin(user) && (
              <NavLink href="/approvals">
                <span className="flex items-center justify-between">
                  Approvals
                  {approvals.total > 0 && (
                    <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950">
                      {approvals.total}
                    </span>
                  )}
                </span>
              </NavLink>
            )}
          </div>
          <div className="space-y-0.5">
            <div className="nav-section">Inventory</div>
            <NavLink href="/inventory" exact>
              <span className="flex items-center justify-between">
                Stock
                {lowStock.length > 0 && (
                  <span className="rounded-full bg-red-400 px-1.5 text-[11px] font-semibold text-red-950" title="Low or out of stock">
                    {lowStock.length}
                  </span>
                )}
              </span>
            </NavLink>
            <NavLink href="/inventory/requests">Requests</NavLink>
          </div>
          <div className="space-y-0.5">
            <div className="nav-section">Operations</div>
            <NavLink href="/operations" exact>
              School sessions
            </NavLink>
            <NavLink href="/operations/schedule">Week schedule</NavLink>
            <NavLink href="/operations/programmes">School programmes</NavLink>
            {isManagerOrAdmin(user) && <NavLink href="/operations/reports">Delivery reports</NavLink>}
            <NavLink href="/workshops">Workshops</NavLink>
          </div>
          <div className="space-y-0.5">
            <div className="nav-section">Purchases</div>
            <NavLink href="/purchases" exact>
              Purchase orders
            </NavLink>
            <NavLink href="/purchases/vendors">Vendors</NavLink>
            {isAdmin(user) && <NavLink href="/purchases/payables">Payables</NavLink>}
          </div>
          <div className="space-y-0.5">
            <div className="nav-section">CRM</div>
            <NavLink href="/crm/leads">Leads</NavLink>
            <NavLink href="/crm/deals">Deals</NavLink>
            <NavLink href="/crm/organizations">Institutions</NavLink>
            <NavLink href="/crm/contacts">Contacts</NavLink>
            <NavLink href="/crm/activities">Follow-ups</NavLink>
          </div>
          {isManagerOrAdmin(user) && (
            <div className="space-y-0.5">
              <div className="nav-section">Billing</div>
              <NavLink href="/accounts">Accounts summary</NavLink>
              <NavLink href="/quotes">Quotes</NavLink>
              <NavLink href="/invoices" exact>
                Invoices
              </NavLink>
              <NavLink href="/credit-notes">Credit notes</NavLink>
              <NavLink href="/invoices/dues">Payments due</NavLink>
            </div>
          )}
          <div className="space-y-0.5">
            <div className="nav-section">HR</div>
            {user.employee && <NavLink href={`/hr/employees/${user.employee.id}`}>My profile</NavLink>}
            <NavLink href="/hr/attendance" exact>
              My attendance
            </NavLink>
            <NavLink href="/hr/leave">My leave</NavLink>
            <NavLink href="/hr/employees" exact>
              People
            </NavLink>
            {isManagerOrAdmin(user) && <NavLink href="/hr/attendance/register">Attendance register</NavLink>}
            {isManagerOrAdmin(user) && (
              <NavLink href="/recruitment">
                <span className="flex items-center justify-between">
                  Recruitment
                  {onlineApplications > 0 && (
                    <span
                      className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950"
                      title="New applications from the careers page"
                    >
                      {onlineApplications}
                    </span>
                  )}
                </span>
              </NavLink>
            )}
            {(isManagerOrAdmin(user) || myInterviews > 0) && (
              <NavLink href="/recruitment/interviews">
                <span className="flex items-center justify-between">
                  My interviews
                  {myInterviews > 0 && (
                    <span className="nav-badge">{myInterviews}</span>
                  )}
                </span>
              </NavLink>
            )}
            {isManagerOrAdmin(user) && <NavLink href="/hr/onboarding">Onboarding</NavLink>}
            {isManagerOrAdmin(user) && <NavLink href="/hr/training">Training</NavLink>}
            {isManagerOrAdmin(user) && <NavLink href="/hr/exits">Exits</NavLink>}
            <NavLink href="/hr/reviews">
              <span className="flex items-center justify-between">
                Performance reviews
                {reviewTodos.length > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950">{reviewTodos.length}</span>
                )}
              </span>
            </NavLink>
            {isAdmin(user) && <NavLink href="/hr/assets">Assets</NavLink>}
            <NavLink href="/hr/holidays">Holidays</NavLink>
          </div>
          {(user.employee || isAdmin(user)) && (
            <div className="space-y-0.5">
              <div className="nav-section">Payroll</div>
              {user.employee && <NavLink href="/payroll/my">My payslips</NavLink>}
              {isAdmin(user) && (
                <NavLink href="/payroll" exact>
                  Payroll
                </NavLink>
              )}
            </div>
          )}
          {isAdmin(user) && (
            <div className="space-y-0.5">
              <div className="nav-section">Admin</div>
              <NavLink href="/admin/users">Users</NavLink>
              <NavLink href="/admin/activity">Activity log</NavLink>
              <NavLink href="/admin/backups">Backups</NavLink>
              <NavLink href="/hr/departments">Departments</NavLink>
              <NavLink href="/hr/leave-types">Leave types</NavLink>
              <NavLink href="/admin/settings">Settings</NavLink>
            </div>
          )}
        </nav>
        <div className="sidebar-user">
          <div className="avatar md:hidden">{initials(user.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium md:hidden">{user.name}</div>
            <div className="sidebar-muted text-xs md:hidden">{humanize(user.role)}</div>
            <div className="mt-1 flex items-center gap-3">
              <Link href="/account" className="sidebar-link text-xs">
                My account
              </Link>
              <form action={logout}>
                <button className="sidebar-link text-xs">Sign out</button>
              </form>
            </div>
          </div>
        </div>
      </Sidebar>
      <main className="app-main min-w-0 flex-1 p-4 md:py-3 md:pr-4 md:pl-1">
        <div className="mx-auto max-w-[1400px]">
          <header className="topbar">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {waiting.length === 0 ? (
                <span className="text-slate-500">Nothing waiting on you right now.</span>
              ) : (
                <>
                  <span className="text-slate-500">Waiting on you:</span>
                  {waiting.map((w) => (
                    <Link key={w.href} href={w.href} className="rounded-full bg-mint px-3 py-1 text-xs font-medium text-ink hover:brightness-95">
                      {w.label}
                    </Link>
                  ))}
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Link href="/inbox" className="icon-btn" title={inbox > 0 ? `Inbox · ${inbox} unread` : "Inbox"}>
                <Icon name="bell" className="h-4 w-4" />
                {inbox > 0 && <span className="icon-btn-dot">{inbox}</span>}
              </Link>
              <Link href="/account" className="flex items-center gap-2.5 rounded-full py-1 pr-3 pl-1 hover:bg-slate-50">
                <span className="avatar">{initials(user.name)}</span>
                <span className="leading-tight">
                  <span className="block text-sm font-semibold">{user.name}</span>
                  <span className="block text-xs text-slate-500">{user.email}</span>
                </span>
              </Link>
            </div>
          </header>
          <div className="md:px-4 md:pt-1 md:pb-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
