import type { Role } from "@prisma/client";

export const ROLES = ["ADMIN", "HR", "MANAGER", "EMPLOYEE"] as const;
export const isHrOrAdmin = (user: { role: Role }) => user.role === "ADMIN" || user.role === "HR";
export const canManagePeople = (user: { role: Role }) => isHrOrAdmin(user) || user.role === "MANAGER";
/**
 * Who may change a lead or deal: the person who owns it, a manager or an admin. Records nobody owns stay
 * open to all, so nothing gets stuck. Everyone can still see the pipeline; only admins delete.
 */
export const canEditCrmRecord = (user: { id: string; role: Role }, record: { ownerId: string | null }) =>
  user.role === "ADMIN" || user.role === "MANAGER" || !record.ownerId || record.ownerId === user.id;
/** A follow-up is ticked off by the person it is for, whoever set it, a manager or an admin. */
export const canTickActivity = (user: { id: string; role: Role }, activity: { assigneeId: string | null; createdById: string }) =>
  canEditCrmRecord(user, { ownerId: activity.assigneeId }) || activity.createdById === user.id;

/** The company owner: an admin with the owner mark (there is one), who also sees the money picture. */
export const isOwner = (user: { role: Role; isOwner?: boolean }) => user.role === "ADMIN" && user.isOwner === true;

// Unknown and salary-bearing document categories remain private to Admin and owner.
export const HR_DOCUMENT_TYPES = ["Aadhaar / ID proof", "PAN card", "Educational certificate", "Resume", "Passport photo"] as const;
export const canAccessEmployeeDocument = (user: { role: Role; employee?: { id: string } | null }, doc: { employeeId: string; type: string }) =>
  user.role === "ADMIN" || user.employee?.id === doc.employeeId ||
  (user.role === "HR" && HR_DOCUMENT_TYPES.some(type => type === doc.type));

/** The four dashboards. Each role opens the ones its job needs; the first in the list is its own. */
export const DASHBOARDS = [
  { key: "owner", href: "/dashboard", label: "Owner dashboard", short: "Owner" },
  { key: "admin", href: "/dashboard/admin", label: "Admin dashboard", short: "Admin" },
  { key: "hr", href: "/dashboard/hr", label: "HR dashboard", short: "HR" },
  { key: "me", href: "/dashboard/me", label: "My dashboard", short: "Mine" },
] as const;
export type DashboardKey = (typeof DASHBOARDS)[number]["key"];

export function canOpenDashboard(user: { role: Role; isOwner?: boolean }, key: DashboardKey) {
  switch (key) {
    case "owner": return isOwner(user);
    case "admin": return user.role === "ADMIN";
    case "hr": return isHrOrAdmin(user);
    case "me": return true;
  }
}

export const dashboardsFor = (user: { role: Role; isOwner?: boolean }) => DASHBOARDS.filter((d) => canOpenDashboard(user, d.key));
/** The dashboard that fits the person's day: owner, admin, HR, or their own (employees and managers). */
export const homeDashboard = (user: { role: Role; isOwner?: boolean }) => dashboardsFor(user)[0];

/** Columns of the Roles and permissions table: the owner first, then the four roles. */
export const ROLE_COLUMNS = ["Owner", "Admin", "HR", "Manager", "Employee"] as const;

/** What each role is for, in one line, shown above the permissions table and in the handover notes. */
export const ROLE_DUTIES: Record<(typeof ROLE_COLUMNS)[number], string> = {
  Owner: "Runs the business: money in and out, profit, dues, payroll cost and the whole picture. Has every admin power. One person; handed over in Users.",
  Admin: "Runs the company day to day: logins and roles, settings, backups, billing, purchases, stock, payroll and approvals.",
  HR: "Looks after people: employee records, attendance, leave, hiring, onboarding, training, reviews, exits and assets. No payroll, salaries or logins.",
  Manager: "Leads a team: approves their leave, timesheets, expenses and requests, runs school delivery and projects, sees billing.",
  Employee: "Does their own work: attendance, leave, tasks, checklists, sessions, timesheet, expenses, payslips and requests.",
};

export const PERMISSION_ROWS = [
  { label: "Dashboards", access: ["Owner, admin, HR, own", "Admin, HR, own", "HR, own", "Own, with team", "Own"] },
  { label: "Money picture: profit, cash in and out, ageing", access: ["Full", "Through billing and payables pages", "None", "Billing pages", "None"] },
  { label: "Employee records, onboarding, training", access: ["Organization", "Organization", "Organization", "Direct reports", "Own record"] },
  { label: "Leave and attendance decisions", access: ["Organization, no self-approval", "Organization, no self-approval", "Organization, no self-approval", "Direct reports, no self-approval", "Request only"] },
  { label: "Employee documents", access: ["All", "All", "ID, PAN, education, resume; all own", "None", "Own only"] },
  { label: "HR letters and certificates", access: ["All, including ones that show pay", "All, including ones that show pay", "Issue and see all except ones that show pay", "None", "Download own"] },
  { label: "Departments, leave policies, holidays, assets", access: ["Manage", "Manage", "Manage", "View where available", "View where available"] },
  { label: "Recruitment jobs, candidates, interviews", access: ["Manage", "Manage", "Manage", "Manage", "Assigned interviews"] },
  { label: "Offers, final hiring, salary structures, payroll", access: ["Manage", "Manage", "Own payslips only", "Own payslips only", "Own payslips only"] },
  { label: "CRM leads and deals", access: ["See all, change all, delete", "See all, change all, delete", "See all, change own", "See all, change all", "See all, change own"] },
  { label: "Quotes, invoices, credit notes, payments due", access: ["Manage", "Manage", "None", "Manage", "None"] },
  { label: "Purchases, vendor bills, payables", access: ["Manage", "Manage", "Raise requests", "Approve team requests", "Raise requests"] },
  { label: "Stock", access: ["Manage", "Manage", "Request", "Request, approve team", "Request"] },
  { label: "Finance administration", access: ["Manage", "Manage", "Personal expenses only", "Existing finance permissions", "Personal expenses only"] },
  { label: "User accounts, roles, settings, backups", access: ["Manage, and hand over ownership", "Manage (not the owner's login)", "No access", "No access", "No access"] },
] as const;
