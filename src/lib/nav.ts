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
};

export type NavGroupData = {
  title: string;
  icon: IconName;
  /** Pages that belong to the group, so it opens (and its tabs show) while you are on one. */
  paths: string[];
  items: NavItem[];
};

export type NavCounts = {
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

type NavUser = { role: Role; isOwner?: boolean; employee: { id: string } | null };

/**
 * The whole menu for one person, as plain data. The side menu, the tabs along the top of each page and the
 * "Find anything" search box are all drawn from this, so a page only has to be added here once.
 */
export function buildNav(user: NavUser, c: NavCounts): NavGroupData[] {
  const admin = user.role === "ADMIN";
  const managerOrAdmin = admin || user.role === "MANAGER";
  const people = canManagePeople(user);
  const hrOrAdmin = isHrOrAdmin(user);
  const groups: (NavGroupData | false)[] = [
    {
      title: "Overview",
      icon: "grid",
      paths: ["/", "/inbox", "/messages", "/calendar", "/dashboard", "/notices", "/recognition", "/guide"],
      items: [
        { href: "/", label: "Home" },
        // Each role's dashboards: its own first (owner, admin, HR or "My dashboard"), then the others its job needs.
        ...dashboardsFor(user).map((d) => ({ href: d.href, label: d.label, exact: true })),
        { href: "/calendar", label: "Calendar" },
        { href: "/inbox", label: "Inbox", badge: c.inbox, tone: "brand", title: "Unread notifications" },
        { href: "/messages", label: "Messages", badge: c.messages, tone: "brand", title: "Unread messages from colleagues" },
        { href: "/notices", label: "Notice board", badge: c.toAcknowledge, tone: "amber" as const },
        { href: "/recognition", label: "Recognition" },
        { href: "/guide", label: "Getting started" },
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
        { href: "/projects/pulse", label: "Daily pulse" },
        { href: "/projects", label: "Projects", except: ["/projects/pulse"] },
        { href: "/timesheets", label: "Timesheet" },
        {
          href: "/checklists",
          label: "Checklists",
          badge: c.checklists,
          tone: c.overdueChecklists ? "red" : "amber",
          title: c.overdueChecklists ? "Some are overdue" : "To tick off",
        },
        { href: "/expenses", label: "Expenses", exact: true },
        ...(managerOrAdmin ? [{ href: "/expenses/team", label: "Team expenses" }] : []),
        { href: "/helpdesk", label: "Helpdesk", badge: c.helpdesk, tone: "amber" as const },
        ...(managerOrAdmin ? [{ href: "/approvals", label: "Approvals", badge: c.approvals, tone: "amber" as const }] : []),
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
      icon: "box",
      paths: ["/inventory"],
      items: [
        { href: "/inventory", label: "Stock", exact: true, badge: c.lowStock, tone: "red", title: "Low or out of stock" },
        { href: "/inventory/requests", label: "Requests" },
      ],
    },
    {
      title: "Purchases",
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
        { href: "/hr", label: "My day", exact: true },
        ...(user.employee ? [{ href: `/hr/employees/${user.employee.id}`, label: "My profile" }] : []),
        { href: "/hr/attendance", label: "My attendance", exact: true },
        { href: "/hr/leave", label: "My leave" },
        { href: "/hr/employees", label: "People", exact: true },
        ...(people ? [{ href: "/hr/attendance/register", label: "Attendance register" }] : []),
        ...(people ? [{ href: "/hr/approvals", label: "Leave approvals" }] : []),
        ...(people
          ? [{ href: "/recruitment", label: "Recruitment", except: ["/recruitment/interviews"], badge: c.onlineApplications, tone: "amber" as const, title: "New applications from the careers page" }]
          : []),
        ...(people || c.myInterviews > 0 ? [{ href: "/recruitment/interviews", label: "My interviews", badge: c.myInterviews, tone: "brand" as const }] : []),
        ...(people ? [{ href: "/hr/onboarding", label: "Onboarding" }, { href: "/hr/training", label: "Training" }] : []),
        ...(managerOrAdmin ? [{ href: "/hr/exits", label: "Exits" }] : []),
        { href: "/hr/reviews", label: "Performance reviews", badge: c.reviewTodos, tone: "amber" },
        ...(hrOrAdmin ? [{ href: "/hr/assets", label: "Assets" }] : []),
        { href: "/hr/holidays", label: "Holidays" },
        ...(hrOrAdmin ? [{ href: "/hr/departments", label: "Departments" }, { href: "/hr/leave-types", label: "Leave types" }] : []),
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
        { href: "/admin/backups", label: "Backups" },
        { href: "/admin/settings", label: "Settings" },
      ],
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
