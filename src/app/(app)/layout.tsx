import { isHrOrAdmin, canManagePeople } from "@/lib/permissions";
import { requireUser, isAdmin, isManagerOrAdmin } from "@/lib/auth";
import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { NavSection } from "@/components/nav-section";
import { NavIcon } from "@/components/nav-icon";
import { Sidebar } from "@/components/sidebar";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { WorkspaceDock } from "@/components/workspace-dock";
import { humanize } from "@/lib/format";
import { pendingApprovals } from "@/lib/approvals";
import { lowStockItems } from "@/lib/inventory";
import { db } from "@/lib/db";
import { myPendingAcks } from "@/lib/notices";
import { helpdeskCounts } from "@/lib/helpdesk";
import { myReviewTodos } from "@/lib/reviews";
import { newOnlineApplications } from "@/lib/careers";
import { myChecklistsNow } from "@/lib/checklists";
import { logout } from "../actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [approvals, lowStock, myInterviews, toAcknowledge, helpdesk, reviewTodos, onlineApplications, checklists] = await Promise.all([
    pendingApprovals(user),
    isAdmin(user) ? lowStockItems() : [],
    db.interview.count({ where: { interviewerId: user.id, status: "SCHEDULED" } }),
    myPendingAcks(user),
    helpdeskCounts(user),
    myReviewTodos(user),
    canManagePeople(user) ? newOnlineApplications() : 0,
    myChecklistsNow(user.id),
  ]);
  const overdueChecklists = checklists.open.some((e) => e.status === "OVERDUE");

  return (
    <div className="min-h-screen">
      <Sidebar
        header={
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 font-display text-sm font-bold">E</div>
            <div className="sidebar-brand-label leading-tight">
              <div className="font-display text-sm font-semibold">Edubotics One</div>
              <div className="text-[11px] text-slate-400">Global Operations</div>
            </div>
          </div>
        }
      >
        <nav id="primary-navigation" aria-label="Page directory" className="workspace-nav min-h-0 flex-1 space-y-2 overflow-y-auto">
          <NavSection title="Overview" icon="home" routes={["/", "/guide", "/dashboard", "/notices"]}>
            <NavLink href="/">Home</NavLink>
            <NavLink href="/guide">Getting started</NavLink>
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
          </NavSection>
          <NavSection title="Work" icon="work" routes={["/work", "/projects", "/timesheets", "/checklists", "/expenses", "/expenses/team", "/helpdesk", "/approvals"]}><NavLink href="/work">My work</NavLink>
            <NavLink href="/projects">Projects</NavLink>
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
          </NavSection>
          <NavSection title="Inventory" icon="inventory" routes={["/inventory", "/inventory/requests"]}><NavLink href="/inventory" exact>
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
          </NavSection>
          <NavSection title="Operations" icon="operations" routes={["/operations", "/operations/schedule", "/operations/programmes", "/operations/reports", "/workshops"]}><NavLink href="/operations" exact>
              School sessions
            </NavLink>
            <NavLink href="/operations/schedule">Week schedule</NavLink>
            <NavLink href="/operations/programmes">School programmes</NavLink>
            {isManagerOrAdmin(user) && <NavLink href="/operations/reports">Delivery reports</NavLink>}
            <NavLink href="/workshops">Workshops</NavLink>
          </NavSection>
          <NavSection title="Purchases" icon="purchases" routes={["/purchases", "/purchases/vendors", "/purchases/payables"]}><NavLink href="/purchases" exact>
              Purchase orders
            </NavLink>
            <NavLink href="/purchases/vendors">Vendors</NavLink>
            {isAdmin(user) && <NavLink href="/purchases/payables">Payables</NavLink>}
          </NavSection>
          <NavSection title="CRM" icon="crm" routes={["/crm/leads", "/crm/deals", "/crm/organizations", "/crm/contacts", "/crm/activities"]}><NavLink href="/crm/leads">Leads</NavLink>
            <NavLink href="/crm/deals">Deals</NavLink>
            <NavLink href="/crm/organizations">Institutions</NavLink>
            <NavLink href="/crm/contacts">Contacts</NavLink>
            <NavLink href="/crm/activities">Follow-ups</NavLink>
          </NavSection>
          {isManagerOrAdmin(user) && (
            <NavSection title="Billing" icon="billing" routes={["/accounts", "/quotes", "/invoices", "/credit-notes", "/invoices/dues"]}><NavLink href="/accounts">Accounts summary</NavLink>
              <NavLink href="/quotes">Quotes</NavLink>
              <NavLink href="/invoices" exact>
                Invoices
              </NavLink>
              <NavLink href="/credit-notes">Credit notes</NavLink>
              <NavLink href="/invoices/dues">Payments due</NavLink>
            </NavSection>
          )}
          <NavSection title="HR" icon="hr" routes={["/hr", "/recruitment"]}><NavLink href="/hr" exact>My day</NavLink>{user.employee && <NavLink href={`/hr/employees/${user.employee.id}`}>My profile</NavLink>}
            <NavLink href="/hr/attendance" exact>
              My attendance
            </NavLink>
            <NavLink href="/hr/leave">My leave</NavLink>
            <NavLink href="/hr/employees" exact>
              People
            </NavLink>
            {canManagePeople(user) && <NavLink href="/hr/attendance/register">Attendance register</NavLink>}
            {canManagePeople(user) && (
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
            {(canManagePeople(user) || myInterviews > 0) && (
              <NavLink href="/recruitment/interviews">
                <span className="flex items-center justify-between">
                  My interviews
                  {myInterviews > 0 && (
                    <span className="rounded-full bg-white/15 px-1.5 text-[11px] font-semibold">{myInterviews}</span>
                  )}
                </span>
              </NavLink>
            )}
            {canManagePeople(user) && <NavLink href="/hr/onboarding">Onboarding</NavLink>}
            {canManagePeople(user) && <NavLink href="/hr/training">Training</NavLink>}
            {isManagerOrAdmin(user) && <NavLink href="/hr/exits">Exits</NavLink>}
            <NavLink href="/hr/reviews">
              <span className="flex items-center justify-between">
                Performance reviews
                {reviewTodos.length > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950">{reviewTodos.length}</span>
                )}
              </span>
            </NavLink>
            {isHrOrAdmin(user) && <NavLink href="/hr/assets">Assets</NavLink>}
            {canManagePeople(user) && <NavLink href="/hr/approvals">Leave approvals</NavLink>}
            {isHrOrAdmin(user) && <><NavLink href="/hr/departments">Departments</NavLink><NavLink href="/hr/leave-types">Leave types</NavLink></>}
            <NavLink href="/hr/holidays">Holidays</NavLink>
          </NavSection>
          {(user.employee || isAdmin(user)) && (
            <NavSection title="Payroll" icon="payroll" routes={["/payroll/my", "/payroll"]}>{user.employee && <NavLink href="/payroll/my">My payslips</NavLink>}
              {isAdmin(user) && (
                <NavLink href="/payroll" exact>
                  Payroll
                </NavLink>
              )}
            </NavSection>
          )}
          {isAdmin(user) && (
            <NavSection title="Admin" icon="admin" routes={["/admin/roles", "/admin/launch", "/admin/users", "/admin/activity", "/admin/health", "/admin/backups", "/hr/departments", "/hr/leave-types", "/admin/settings"]}><NavLink href="/admin/launch">Launch readiness</NavLink>
              <NavLink href="/admin/users">Users</NavLink>
              <NavLink href="/admin/roles">Roles & permissions</NavLink>
              <NavLink href="/admin/activity">Activity log</NavLink>
              <NavLink href="/admin/health">Service health</NavLink>
              <NavLink href="/admin/backups">Backups</NavLink>
              <NavLink href="/admin/settings">Settings</NavLink>
            </NavSection>
          )}
        </nav>
        <div className="sidebar-footer mt-4 border-t border-white/10 pt-3 text-sm">
          <div className="sidebar-user font-medium">{user.name}</div>
          <div className="sidebar-user text-xs text-slate-400">{humanize(user.role)}</div>
          <div className="sidebar-account-actions mt-2 flex items-center gap-3">
            <Link href="/account" title="My account" aria-label="My account" className="sidebar-account-link text-xs text-slate-300 hover:text-white">
              <NavIcon name="account" /><span className="sidebar-footer-label">My account</span>
            </Link>
            <form action={logout}>
              <button aria-label="Sign out" title="Sign out" className="sidebar-account-link text-xs text-slate-300 hover:text-white"><NavIcon name="logout" /><span className="sidebar-footer-label">Sign out</span></button>
            </form>
          </div>
        </div>
      </Sidebar>
      <main id="main-content" tabIndex={-1} className="workspace-main mx-auto w-full min-w-0 p-4 md:p-8 lg:p-10">
        <WorkspaceDock items={[
          { label: "Home", href: "/", icon: "home", routes: ["/", "/guide", "/dashboard", "/notices"] },
          { label: "My work", href: "/work", icon: "check", routes: ["/work", "/timesheets", "/checklists", "/expenses", "/helpdesk", "/approvals"] },
          { label: "Projects", href: "/projects", icon: "work", routes: ["/projects"] },
          { label: "CRM", href: "/crm/deals", icon: "crm", routes: ["/crm"] },
          { label: "Inventory", href: "/inventory", icon: "inventory", routes: ["/inventory"] },
          { label: "Operations", href: "/operations", icon: "operations", routes: ["/operations", "/workshops"] },
          { label: "Purchases", href: "/purchases", icon: "purchases", routes: ["/purchases"] },
          { label: "HR", href: "/hr", icon: "hr", routes: ["/hr", "/recruitment"] },
          ...(isManagerOrAdmin(user) ? [{ label: "Billing", href: "/accounts", icon: "billing", routes: ["/accounts", "/quotes", "/invoices", "/credit-notes"] }] : []),
          ...(user.employee || isAdmin(user) ? [{ label: "Payroll", href: isAdmin(user) ? "/payroll" : "/payroll/my", icon: "payroll", routes: ["/payroll"] }] : []),
          ...(isAdmin(user) ? [{ label: "Admin", href: "/admin/users", icon: "admin", routes: ["/admin", "/hr/departments", "/hr/leave-types"] }] : []),
        ]} />
        <Breadcrumbs />{children}
      </main>
    </div>
  );
}
