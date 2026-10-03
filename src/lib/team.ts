import "server-only";
import { db } from "./db";
import { isAdmin, type CurrentUser } from "./auth";

/** Employees this user manages: everyone for admins, direct reports for managers. */
export function managedEmployees(user: CurrentUser) {
  return db.employee.findMany({
    where: {
      status: { in: ["ACTIVE", "ONBOARDING", "ON_NOTICE"] },
      ...(isAdmin(user) ? {} : { managerId: user.employee?.id ?? "__none__" }),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, code: true, firstName: true, lastName: true, designation: true, status: true },
  });
}

/** Admins can act on anyone; managers on their direct reports. */
export async function canManage(user: CurrentUser, employeeId: string) {
  if (isAdmin(user)) return true;
  if (user.role !== "MANAGER" || !user.employee) return false;
  const e = await db.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } });
  return e?.managerId === user.employee.id;
}
