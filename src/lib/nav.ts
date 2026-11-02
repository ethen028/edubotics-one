import type { Role } from "@prisma/client";
import type { IconName } from "@/components/icons";
import { canManagePeople, dashboardsFor, isHrOrAdmin } from "@/lib/permissions";

/** One page in the menu. `badge` is a count of things waiting there; `tone` picks its colour. */
export type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  /** Sub-pages that have their own menu item, so this one isn't lit up there too. */
  except?: string[];
  badge?: number;
  tone?: "amber" | "red" | "brand";
  title?: string;
  /** A small heading in the menu panel above this item and the ones after it, for long sections (HR: For me, Team, Setup). */
  section?: string;
};

export type NavGroupData = {
  title: string;
  /** The name under the icon in the menu rail, when the title is too long for it. */
  short?: string;
  icon: IconName;
  /** Pages that belong to the group, so it opens (and its tabs show) while you are on one. */
  paths: string[];
  items: NavItem[];
};

export type NavCounts = {
  /** Whether this login can use Teamwork (Messages, Channels, Files, Meetings): see Admin > Settings > Teamwork. */
  teamwork: boolean;
  inbox: number;
  messages: number;
  toAcknowledge: number;
  checklists: number;
  overdueChecklists: boolean;
  helpdesk: number;
  approvals: number;
  lowStock: number;
  onlineApplications: number;
  myInterviews: number;
  reviewTodos: number;
  planToUpdate: number;
};

type NavUser = { role: Role; isOwner?: boolean; isSuperadmin?: boolean; employee: { id: string } | null };

/**
 * The whole menu for one person, as plain data. The side menu, the tabs along the top of each page and the
 * "Find anything" search box are all drawn from this, so a page only has to be added here once.
 */
export function buildNav(user: NavUser, c: NavCounts, where: { backups: boolean } = { backups: user.isSuperadmin === true }): NavGroupData[] {
  const admin = user.role === "ADMIN";
  const managerOrAdmin = admin || user.role === "MANAGER";
  const people = canManagePeople(user);
  const hrOrAdmin = isHrOrAdmin(user);
  const groups: (NavGroupData | false)[] = [
    {
      title: "Overview",
      short: "Home",
      icon: "grid",
      paths: ["/", "/inbox", "/calendar", "/dashboard", "/notices", "/recognition", "/guide"],
      items: [
        { href: "/", label: "Home" },
        { href: "/inbox", label: "Inbox", badge: c.inbox, tone: "brand", title: "Unread notifications" },
        { href: "/calendar", label: "Calendar" },
        { href: "/notices", label: "Notice board", badge: c.toAcknowledge, tone: "amber" as const },
        { href: "/recognition", label: "Recognition" },
        { href: "/guide", label: "Getting started" },
        // Each role's dashboards: its own first (owner, admin, HR or "My dashboard"), then the others its job needs.
        ...dashboardsFor(user).map((d) => ({ href: d.href, label: d.label, exact: true, section: "Dashboards" })),
      ],
    },
    c.teamwork && {
      title: "Teamwork",
      icon: "chat",
      paths: ["/messages", "/channels", "/files", "/meetings"],
      items: [
        { href: "/messages", label: "Messages", badge: c.messages, tone: "brand", title: "Unread messages and channel posts" },
        { href: "/channels", label: "Channels" },
        { href: "/files", label: "Files" },
        { href: "/meetings", label: "Meetings" },
      ],
    },
    {
      title: "Plan",
      icon: "flag",
      paths: ["/plan"],
      items: [
        { href: "/plan", label: "Monthly work plan", exact: true, badge: c.planToUpdate, tone: "amber", title: "Your tasks to update this week" },
        { href: "/plan/year", label: "Annual plan" },
      ],
    },
    {
      title: "Work",
      icon: "briefcase",
      paths: ["/work", "/projects", "/timesheets", "/checklists", "/expenses", "/helpdesk", "/approvals"],
      items: [
        { href: "/work", label: "My work" },
        { href: "/timesheets", label: "Timesheet" },
        {
          href: "/checklists",
          label: "Checklists",
          badge: c.checklists,
          tone: c.overdueChecklists ? "red" : "amber",
          title: c.overdueChecklists ? "Some are overdue" : "To tick off",
        },
        { href: "/expenses", label: "Expenses", exact: true },
        { href: "/helpdesk", label: "Helpdesk", badge: c.helpdesk, tone: "amber" as const },
        { href: "/projects", label: "Projects", except: ["/projects/pulse"], section: "Projects" },
        { href: "/projects/pulse", label: "Daily pulse", section: "Projects" },
        ...(managerOrAdmin
          ? [
              { href: "/approvals", label: "Approvals", badge: c.approvals, tone: "amber" as const, section: "Team" },
              { href: "/expenses/team", label: "Team expenses", section: "Team" },
            ]
          : []),
      ],
    },
    {
      title: "CRM",
      icon: "handshake",
      paths: ["/crm"],
      items: [
        { href: "/crm/leads", label: "Leads" },
        { href: "/crm/deals", label: "Deals" },
        { href: "/crm/organizations", label: "Institutions" },
        { href: "/crm/contacts", label: "Contacts" },
        { href: "/crm/activities", label: "Follow-ups" },
        ...(managerOrAdmin ? [{ href: "/crm/commission", label: "Sales commission" }] : []),
      ],
    },
    {
      title: "Operations",
      short: "Schools",
      icon: "school",
      paths: ["/operations", "/workshops"],
      items: [
        { href: "/operations", label: "School sessions", exact: true },
        { href: "/operations/schedule", label: "Week schedule" },
        { href: "/operations/programmes", label: "School programmes" },
        ...(managerOrAdmin ? [{ href: "/operations/reports", label: "Delivery reports" }] : []),
        { href: "/workshops", label: "Workshops and internships" },
      ],
    },
    {
      title: "Inventory",
      short: "Stock",
      icon: "box",
      paths: ["/inventory"],
      items: [
        { href: "/inventory", label: "Stock", exact: true, badge: c.lowStock, tone: "red", title: "Low or out of stock" },
        { href: "/inventory/requests", label: "Requests" },
      ],
    },
    {
      title: "Purchases",
      short: "Buying",
      icon: "cart",
      paths: ["/purchases"],
      items: [
        { href: "/purchases", label: "Purchase orders", exact: true },
        { href: "/purchases/vendors", label: "Vendors" },
        ...(admin ? [{ href: "/purchases/payables", label: "Payables" }] : []),
      ],
    },
    managerOrAdmin && {
      title: "Billing",
      icon: "receipt",
      paths: ["/accounts", "/quotes", "/invoices", "/credit-notes"],
      items: [
        { href: "/accounts", label: "Accounts summary" },
        { href: "/quotes", label: "Quotes" },
        { href: "/invoices", label: "Invoices", exact: true },
        { href: "/credit-notes", label: "Credit notes" },
        { href: "/invoices/dues", label: "Payments due" },
      ],
    },
    {
      title: "HR",
      icon: "users",
      paths: ["/hr", "/recruitment"],
      items: [
        { href: "/hr", label: "My day", exact: true, section: "For me" },
        ...(user.employee ? [{ href: `/hr/employees/${user.employee.id}`, label: "My profile", section: "For me" }] : []),
        { href: "/hr/attendance", label: "My attendance", exact: true, section: "For me" },
        { href: "/hr/leave", label: "My leave", section: "For me" },
        { href: "/hr/reviews", label: "Performance reviews", badge: c.reviewTodos, tone: "amber", section: "For me" },
        ...(people || c.myInterviews > 0
          ? [{ href: "/recruitment/interviews", label: "My interviews", badge: c.myInterviews, tone: "brand" as const, section: "For me" }]
          : []),
        { href: "/hr/holidays", label: "Holidays", section: "For me" },
        { href: "/hr/employees", label: "People", exact: true, section: "Team" },
        ...(people ? [{ href: "/hr/attendance/register", label: "Attendance register", section: "Team" }] : []),
        ...(people ? [{ href: "/hr/approvals", label: "Leave approvals", section: "Team" }] : []),
        ...(people
          ? [
              {
                href: "/recruitment",
                label: "Recruitment",
                except: ["/recruitment/interviews"],
                badge: c.onlineApplications,
                tone: "amber" as const,
                title: "New applications from the careers page",
                section: "Team",
              },
            ]
          : []),
        ...(people ? [{ href: "/hr/onboarding", label: "Onboarding", section: "Team" }, { href: "/hr/training", label: "Training", section: "Team" }] : []),
        ...(managerOrAdmin ? [{ href: "/hr/exits", label: "Exits", section: "Team" }] : []),
        ...(hrOrAdmin ? [{ href: "/hr/letters", label: "Letters", section: "Team" }] : []),
        ...(hrOrAdmin ? [{ href: "/hr/assets", label: "Assets", section: "Team" }] : []),
        ...(hrOrAdmin
          ? [
              { href: "/hr/departments", label: "Departments", section: "Setup" },
              { href: "/hr/leave-types", label: "Leave types", section: "Setup" },
            ]
          : []),
      ],
    },
    (user.employee || admin) && {
      title: "Payroll",
      icon: "wallet",
      paths: ["/payroll"],
      items: [
        ...(user.employee ? [{ href: "/payroll/my", label: "My payslips" }] : []),
        ...(admin ? [{ href: "/payroll", label: "Payroll", exact: true }] : []),
      ],
    },
    admin && {
      title: "Admin",
      icon: "settings",
      paths: ["/admin"],
      items: [
        { href: "/admin/launch", label: "Launch checklist" },
        { href: "/admin/users", label: "Users" },
        { href: "/admin/roles", label: "Roles and permissions" },
        { href: "/admin/activity", label: "Activity log" },
        { href: "/admin/health", label: "Service health" },
        // Backups copy every company, so only the superadmin has them (isBackupAdmin in src/lib/auth.ts).
        ...(where.backups ? [{ href: "/admin/backups", label: "Backups" }] : []),
        { href: "/admin/settings", label: "Settings" },
      ],
    },
    !!user.isSuperadmin && {
      title: "Group",
      icon: "sitemap",
      paths: ["/companies"],
      items: [{ href: "/companies", label: "Companies" }],
    },
  ];
  return groups.filter((g): g is NavGroupData => !!g && g.items.length > 0);
}

/** Whether a menu item is the page being shown. */
export function isActive(item: Pick<NavItem, "href" | "exact" | "except">, pathname: string) {
  const hit = item.href === "/" || item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return hit && !(item.except ?? []).some((e) => pathname === e || pathname.startsWith(`${e}/`));
}

/** The group a page belongs to: the one with a lit-up item, else the one whose paths match best. */
export function groupFor(groups: NavGroupData[], pathname: string) {
  const byItem = groups.find((g) => g.items.some((i) => isActive(i, pathname)));
  if (byItem) return byItem;
  let best: NavGroupData | undefined;
  let length = -1;
  for (const g of groups) {
    for (const p of g.paths) {
      const hit = p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`);
      if (hit && p.length > length) {
        best = g;
        length = p.length;
      }
    }
  }
  return best;
}
