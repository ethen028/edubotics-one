import { requireUser, isAdmin, isManagerOrAdmin } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";
import { Sidebar } from "@/components/sidebar";
import { humanize } from "@/lib/format";
import { pendingApprovals } from "@/lib/approvals";
import { lowStockItems } from "@/lib/inventory";
import { db } from "@/lib/db";
import { myPendingAcks } from "@/lib/notices";
import { helpdeskCounts } from "@/lib/helpdesk";
import { myChecklistsNow } from "@/lib/checklists";
import { logout } from "../actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [approvals, lowStock, myInterviews, toAcknowledge, helpdesk, checklists] = await Promise.all([
    pendingApprovals(user),
    isAdmin(user) ? lowStockItems() : [],
    db.interview.count({ where: { interviewerId: user.id, status: "SCHEDULED" } }),
    myPendingAcks(user),
    helpdeskCounts(user),
    myChecklistsNow(user.id),
  ]);
  const overdueChecklists = checklists.open.some((e) => e.status === "OVERDUE");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        header={
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 font-display text-sm font-bold">E</div>
            <div className="leading-tight">
              <div className="font-display text-sm font-semibold">Edubotics One</div>
              <div className="text-[11px] text-slate-400">Global Operations</div>
            </div>
          </div>
        }
      >
        <nav className="flex-1 space-y-4 overflow-y-auto">
          <div className="space-y-0.5">
            <NavLink href="/">Home</NavLink>
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
            <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Work</div>
            <NavLink href="/work">My work</NavLink>
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
          </div>
          <div className="space-y-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Inventory</div>
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
            <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Operations</div>
            <NavLink href="/operations" exact>
              School sessions
            </NavLink>
            <NavLink href="/operations/schedule">Week schedule</NavLink>
            <NavLink href="/operations/programmes">School programmes</NavLink>
            {isManagerOrAdmin(user) && <NavLink href="/operations/reports">Delivery reports</NavLink>}
          </div>
          <div className="space-y-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Purchases</div>
            <NavLink href="/purchases" exact>
              Purchase orders
            </NavLink>
            <NavLink href="/purchases/vendors">Vendors</NavLink>
            {isAdmin(user) && <NavLink href="/purchases/payables">Payables</NavLink>}
          </div>
          <div className="space-y-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">CRM</div>
            <NavLink href="/crm/leads">Leads</NavLink>
            <NavLink href="/crm/deals">Deals</NavLink>
            <NavLink href="/crm/organizations">Institutions</NavLink>
            <NavLink href="/crm/contacts">Contacts</NavLink>
            <NavLink href="/crm/activities">Follow-ups</NavLink>
          </div>
          {isManagerOrAdmin(user) && (
            <div className="space-y-0.5">
              <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Billing</div>
              <NavLink href="/invoices" exact>
                Invoices
              </NavLink>
              <NavLink href="/invoices/dues">Payments due</NavLink>
            </div>
          )}
          <div className="space-y-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">HR</div>
            {user.employee && <NavLink href={`/hr/employees/${user.employee.id}`}>My profile</NavLink>}
            <NavLink href="/hr/attendance" exact>
              My attendance
            </NavLink>
            <NavLink href="/hr/leave">My leave</NavLink>
            <NavLink href="/hr/employees" exact>
              People
            </NavLink>
            {isManagerOrAdmin(user) && <NavLink href="/hr/attendance/register">Attendance register</NavLink>}
            {isManagerOrAdmin(user) && <NavLink href="/recruitment">Recruitment</NavLink>}
            {(isManagerOrAdmin(user) || myInterviews > 0) && (
              <NavLink href="/recruitment/interviews">
                <span className="flex items-center justify-between">
                  My interviews
                  {myInterviews > 0 && (
                    <span className="rounded-full bg-white/15 px-1.5 text-[11px] font-semibold">{myInterviews}</span>
                  )}
                </span>
              </NavLink>
            )}
            {isManagerOrAdmin(user) && <NavLink href="/hr/onboarding">Onboarding</NavLink>}
            {isManagerOrAdmin(user) && <NavLink href="/hr/training">Training</NavLink>}
            {isAdmin(user) && <NavLink href="/hr/assets">Assets</NavLink>}
            <NavLink href="/hr/holidays">Holidays</NavLink>
          </div>
          {(user.employee || isAdmin(user)) && (
            <div className="space-y-0.5">
              <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Payroll</div>
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
              <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Admin</div>
              <NavLink href="/admin/users">Users</NavLink>
              <NavLink href="/hr/departments">Departments</NavLink>
              <NavLink href="/hr/leave-types">Leave types</NavLink>
              <NavLink href="/admin/settings">Settings</NavLink>
            </div>
          )}
        </nav>
        <div className="mt-4 border-t border-white/10 pt-3 text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="text-xs text-slate-400">{humanize(user.role)}</div>
          <form action={logout} className="mt-2">
            <button className="text-xs text-slate-300 hover:text-white">Sign out</button>
          </form>
        </div>
      </Sidebar>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
