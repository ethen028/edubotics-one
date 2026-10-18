import type { Role } from "@prisma/client";

export const ROLES = ["ADMIN", "HR", "MANAGER", "EMPLOYEE"] as const;
export const isHrOrAdmin = (user: { role: Role }) => user.role === "ADMIN" || user.role === "HR";
export const canManagePeople = (user: { role: Role }) => isHrOrAdmin(user) || user.role === "MANAGER";

// Unknown and salary-bearing document categories remain private to Admin and owner.
export const HR_DOCUMENT_TYPES = ["Aadhaar / ID proof", "PAN card", "Educational certificate", "Resume"] as const;
export const canAccessEmployeeDocument = (user: { role: Role; employee?: { id: string } | null }, doc: { employeeId: string; type: string }) =>
  user.role === "ADMIN" || user.employee?.id === doc.employeeId ||
  (user.role === "HR" && HR_DOCUMENT_TYPES.some(type => type === doc.type));

export const PERMISSION_ROWS = [
  { label: "Employee records, onboarding, training", access: ["Organization", "Organization", "Direct reports", "Own record"] },
  { label: "Leave and attendance decisions", access: ["Organization, no self-approval", "Organization, no self-approval", "Direct reports, no self-approval", "Request only"] },
  { label: "Employee documents", access: ["All", "ID, PAN, education, resume; all own", "None", "Own only"] },
  { label: "Departments, leave policies, holidays, assets", access: ["Manage", "Manage", "View where available", "View where available"] },
  { label: "Recruitment jobs, candidates, interviews", access: ["Manage", "Manage", "Manage", "Assigned interviews"] },
  { label: "Offers, final hiring, salary structures, payroll", access: ["Manage", "Own payslips only", "Own payslips only", "Own payslips only"] },
  { label: "Finance administration", access: ["Manage", "Personal expenses only", "Existing finance permissions", "Personal expenses only"] },
  { label: "User accounts, roles, settings, backups", access: ["Manage", "No access", "No access", "No access"] },
] as const;
