import type { Role } from "@prisma/client";

/**
 * Who may open each signed-in page, by its route. This is the one list of page access: every page's
 * `requireUser([...])` / `requireOwner()` must match its row here (tests/page-access.test.ts checks every
 * page file against it), the menu may only link to pages a role can open, and the "Not for your role" page
 * reads it to say who a page is for.
 *
 * "everyone" means any signed-in role; those pages still narrow the records to what the person may see.
 * "owner" means the company owner (an admin with the owner mark). The owner has every admin right too.
 */
export type PageAccess = "everyone" | "owner" | readonly Role[];

export const PAGE_ACCESS = {
  "/": "everyone",
  "/account": "everyone",
  "/accounts": ["ADMIN", "MANAGER"],
  "/admin/activity": ["ADMIN"],
  "/admin/backups": ["ADMIN"],
  "/admin/health": ["ADMIN"],
  "/admin/launch": ["ADMIN"],
  "/admin/roles": ["ADMIN"],
  "/admin/settings": ["ADMIN"],
  "/admin/users": ["ADMIN"],
  "/approvals": ["ADMIN", "MANAGER"],
  "/calendar": "everyone",
  "/checklists": "everyone",
  "/checklists/history": "everyone",
  "/checklists/run/[templateId]/[key]": "everyone",
  "/checklists/team": ["ADMIN", "MANAGER"],
  "/checklists/templates": ["ADMIN", "MANAGER"],
  "/checklists/templates/[id]": ["ADMIN", "MANAGER"],
  "/checklists/templates/new": ["ADMIN", "MANAGER"],
  "/credit-notes": ["ADMIN", "MANAGER"],
  "/credit-notes/[id]": ["ADMIN", "MANAGER"],
  "/credit-notes/new": ["ADMIN", "MANAGER"],
  "/crm/activities": "everyone",
  "/crm/commission": ["ADMIN", "MANAGER"],
  "/crm/contacts": "everyone",
  "/crm/contacts/[id]": "everyone",
  "/crm/deals": "everyone",
  "/crm/deals/[id]": "everyone",
  "/crm/deals/new": "everyone",
  "/crm/leads": "everyone",
  "/crm/leads/[id]": "everyone",
  "/crm/leads/new": "everyone",
  "/crm/organizations": "everyone",
  "/crm/organizations/[id]": "everyone",
  "/crm/organizations/new": "everyone",
  "/dashboard": "owner",
  "/dashboard/admin": ["ADMIN"],
  "/dashboard/hr": ["ADMIN", "HR"],
  "/dashboard/list": "owner",
  "/dashboard/me": "everyone",
  "/expenses": "everyone",
  "/expenses/team": ["ADMIN", "MANAGER"],
  "/guide": "everyone",
  "/helpdesk": "everyone",
  "/helpdesk/[id]": "everyone",
  "/helpdesk/new": "everyone",
  "/hr": "everyone",
  "/hr/approvals": ["ADMIN", "HR", "MANAGER"],
  "/hr/assets": ["ADMIN", "HR"],
  "/hr/attendance": "everyone",
  "/hr/attendance/register": ["ADMIN", "HR", "MANAGER"],
  "/hr/departments": ["ADMIN", "HR"],
  "/hr/employees": "everyone",
  "/hr/employees/[id]": "everyone",
  "/hr/employees/new": ["ADMIN", "HR"],
  "/hr/exits": ["ADMIN", "MANAGER"],
  "/hr/exits/[id]": "everyone",
  "/hr/exits/new": ["ADMIN"],
  "/hr/exits/resign": "everyone",
  "/hr/holidays": "everyone",
  "/hr/leave": "everyone",
  "/hr/leave-types": ["ADMIN", "HR"],
  "/hr/letters": ["ADMIN", "HR"],
  "/hr/letters/[id]": ["ADMIN", "HR"],
  "/hr/letters/new": ["ADMIN", "HR"],
  "/hr/onboarding": ["ADMIN", "HR", "MANAGER"],
  "/hr/reviews": "everyone",
  "/hr/reviews/[id]": "everyone",
  "/hr/reviews/cycles/[id]": ["ADMIN"],
  "/hr/reviews/cycles/new": ["ADMIN"],
  "/hr/training": ["ADMIN", "HR", "MANAGER"],
  "/inbox": "everyone",
  "/inventory": "everyone",
  "/inventory/[id]": "everyone",
  "/inventory/requests": "everyone",
  "/inventory/requests/[id]": "everyone",
  "/inventory/requests/new": "everyone",
  "/invoices": ["ADMIN", "MANAGER"],
  "/invoices/[id]": ["ADMIN", "MANAGER"],
  "/invoices/dues": ["ADMIN", "MANAGER"],
  "/invoices/new": ["ADMIN", "MANAGER"],
  "/messages": "everyone",
  "/messages/[id]": "everyone",
  "/messages/new": "everyone",
  "/no-access": "everyone",
  "/notices": "everyone",
  "/notices/[id]": "everyone",
  "/notices/[id]/edit": ["ADMIN", "HR", "MANAGER"],
  "/notices/new": ["ADMIN", "HR", "MANAGER"],
  "/operations": "everyone",
  "/operations/programmes": "everyone",
  "/operations/programmes/[id]": "everyone",
  "/operations/programmes/[id]/report": "everyone",
  "/operations/programmes/new": ["ADMIN", "MANAGER"],
  "/operations/reports": ["ADMIN", "MANAGER"],
  "/operations/schedule": "everyone",
  "/operations/sessions/[id]": "everyone",
  "/payroll": ["ADMIN"],
  "/payroll/[month]": ["ADMIN"],
  "/payroll/my": "everyone",
  "/payroll/payslip/[id]": "everyone",
  "/plan": "everyone",
  "/plan/year": "everyone",
  "/projects": "everyone",
  "/projects/[id]": "everyone",
  "/projects/[id]/tasks/[taskId]": "everyone",
  "/projects/new": ["ADMIN", "MANAGER"],
  "/projects/people": ["ADMIN", "MANAGER"],
  "/projects/pulse": "everyone",
  "/projects/timeline": "everyone",
  "/purchases": "everyone",
  "/purchases/[id]": "everyone",
  "/purchases/[id]/print": "everyone",
  "/purchases/bills/[id]": ["ADMIN"],
  "/purchases/bills/new": ["ADMIN"],
  "/purchases/new": "everyone",
  "/purchases/payables": ["ADMIN"],
  "/purchases/vendors": "everyone",
  "/purchases/vendors/[id]": "everyone",
  "/quotes": ["ADMIN", "MANAGER"],
  "/quotes/[id]": ["ADMIN", "MANAGER"],
  "/quotes/new": ["ADMIN", "MANAGER"],
  "/recognition": "everyone",
  "/recognition/give": "everyone",
  "/recruitment": "everyone",
  "/recruitment/candidates": "everyone",
  "/recruitment/candidates/[id]": "everyone",
  "/recruitment/candidates/new": ["ADMIN", "HR", "MANAGER"],
  "/recruitment/interviews": "everyone",
  "/recruitment/jobs/[id]": ["ADMIN", "HR", "MANAGER"],
  "/recruitment/jobs/new": ["ADMIN", "HR", "MANAGER"],
  "/recruitment/offers/[id]": ["ADMIN"],
  "/timesheets": "everyone",
  "/timesheets/log": "everyone",
  "/timesheets/team": ["ADMIN", "MANAGER"],
  "/work": "everyone",
  "/workshops": "everyone",
  "/workshops/[id]": "everyone",
  "/workshops/[id]/attendance": "everyone",
  "/workshops/[id]/certificates": "everyone",
  "/workshops/new": ["ADMIN", "MANAGER"],
  "/workshops/registrations/[id]": "everyone",
} as const satisfies Record<string, PageAccess>;

export type PageRoute = keyof typeof PAGE_ACCESS;

const ROUTES = Object.keys(PAGE_ACCESS) as PageRoute[];

/** The route a typed address belongs to: "/hr/letters/abc" → "/hr/letters/[id]". Fixed segments win over [params]. */
export function routeFor(pathname: string): PageRoute | undefined {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  let best: PageRoute | undefined;
  let bestScore = -1;
  for (const route of ROUTES) {
    const segs = route.split("/").filter(Boolean);
    if (segs.length !== parts.length) continue;
    let score = 0;
    const hit = segs.every((s, i) => {
      if (s.startsWith("[")) return true;
      score++;
      return s === parts[i];
    });
    if (hit && score > bestScore) {
      best = route;
      bestScore = score;
    }
  }
  return best;
}

export function accessAllows(access: PageAccess, user: { role: Role; isOwner?: boolean }) {
  if (access === "everyone") return true;
  if (access === "owner") return user.role === "ADMIN" && user.isOwner === true;
  return access.includes(user.role);
}

/** Whether this person may open the page at this address. Unknown addresses are refused. */
export function canOpenPage(user: { role: Role; isOwner?: boolean }, pathname: string) {
  const route = routeFor(pathname);
  return !!route && accessAllows(PAGE_ACCESS[route], user);
}

export const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admin", HR: "HR", MANAGER: "Manager", EMPLOYEE: "Employee" };

/** "Admin and Manager", "Admin, HR and Manager", "the owner": who a page is for, in words. */
export function whoCanOpen(access: PageAccess) {
  if (access === "everyone") return "everyone";
  if (access === "owner") return "the owner";
  const names = access.map((r) => ROLE_LABEL[r]);
  return names.length < 2 ? (names[0] ?? "nobody") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
