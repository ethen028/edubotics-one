import pageRoutes from "./breadcrumb-routes.json";

const labels: Record<string, string> = {
  projects: "Projects", people: "Team workload", tasks: "Tasks", new: "New", edit: "Edit", dashboard: "Owner dashboard",
  hr: "People & culture", employees: "People", attendance: "Attendance", register: "Register", leave: "Leave", holidays: "Holidays",
  onboarding: "Onboarding", training: "Training", exits: "Exits", reviews: "Reviews", assets: "Assets", departments: "Departments", "leave-types": "Leave types",
  crm: "CRM", leads: "Leads", deals: "Deals", organizations: "Institutions", contacts: "Contacts", activities: "Follow-ups",
  inventory: "Inventory", requests: "Requests", purchases: "Purchases", vendors: "Vendors", payables: "Payables", bills: "Bills",
  operations: "Operations", schedule: "Schedule", programmes: "Programmes", reports: "Reports", workshops: "Workshops",
  accounts: "Accounts", invoices: "Invoices", dues: "Payments due", quotes: "Quotes", "credit-notes": "Credit notes",
  work: "My work", timesheets: "Timesheets", expenses: "Expenses", team: "Team", helpdesk: "Helpdesk", approvals: "Approvals",
  recruitment: "Recruitment", interviews: "Interviews", candidates: "Candidates", payroll: "Payroll", my: "My payslips", payslip: "Payslip",
  admin: "Administration", launch: "Launch readiness", users: "Users", activity: "Activity log", health: "Service health", backups: "Backups", settings: "Settings",
  notices: "Notice board", account: "My account", guide: "Getting started", checklists: "Checklists", templates: "Templates", history: "History", run: "Checklist",
};
const details: Record<string, string> = { projects: "Project", tasks: "Task", employees: "Employee", leads: "Lead", deals: "Deal", candidates: "Candidate", invoices: "Invoice", quotes: "Quote", requests: "Request" };

export function breadcrumbsFor(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs = [{ label: "Home", href: "/" }];
  segments.forEach((segment, index) => {
    const label = labels[segment] ?? details[segments[index - 1]] ?? "Details";
    crumbs.push({ label, href: "/" + segments.slice(0, index + 1).join("/") });
  });
  // Link only to a real page, including dynamic detail pages; grouping prefixes are text.
  return crumbs.map(crumb => ({ ...crumb, linked: !(pageRoutes.some(route => route.startsWith(crumb.href + "/")) && !pageRoutes.includes(crumb.href)) && pageRoutes.some(route => {
    const pattern = route.split("/").filter(Boolean);
    const parts = crumb.href.split("/").filter(Boolean);
    return pattern.length === parts.length && pattern.every((part, index) => part.startsWith("[") || part === parts[index]);
  }) }));
}
