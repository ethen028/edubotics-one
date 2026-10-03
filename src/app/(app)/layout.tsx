import { requireUser, isAdmin, isManagerOrAdmin } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";
import { Sidebar } from "@/components/sidebar";
import { humanize } from "@/lib/format";
import { logout } from "../actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        header={
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold">E1</div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Edubotics One</div>
              <div className="text-[11px] text-slate-400">Edubotics Global</div>
            </div>
          </div>
        }
      >
        <nav className="flex-1 space-y-4 overflow-y-auto">
          <div className="space-y-0.5">
            <NavLink href="/">Dashboard</NavLink>
          </div>
          <div className="space-y-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">CRM</div>
            <NavLink href="/crm/leads">Leads</NavLink>
            <NavLink href="/crm/deals">Deals</NavLink>
            <NavLink href="/crm/organizations">Institutions</NavLink>
            <NavLink href="/crm/contacts">Contacts</NavLink>
            <NavLink href="/crm/activities">Follow-ups</NavLink>
          </div>
          <div className="space-y-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">HR</div>
            <NavLink href="/hr/employees">People</NavLink>
            <NavLink href="/hr/leave">My leave</NavLink>
            {isManagerOrAdmin(user) && <NavLink href="/hr/approvals">Leave approvals</NavLink>}
            <NavLink href="/hr/holidays">Holidays</NavLink>
            {isAdmin(user) && <NavLink href="/hr/departments">Departments</NavLink>}
            {isAdmin(user) && <NavLink href="/hr/leave-types">Leave types</NavLink>}
          </div>
          {isAdmin(user) && (
            <div className="space-y-0.5">
              <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Admin</div>
              <NavLink href="/admin/users">Users</NavLink>
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
