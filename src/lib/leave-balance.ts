import "server-only";
import { db } from "./db";
import { yearBounds } from "./leave";

export type LeaveBalance = {
  leaveTypeId: string;
  code: string;
  name: string;
  quota: number; // 0 = unlimited
  used: number;
  pending: number;
  remaining: number | null; // null = unlimited
};

/** Balances for one employee for a calendar year, by leave type. */
export async function getLeaveBalances(employeeId: string, year = new Date().getFullYear()): Promise<LeaveBalance[]> {
  const [types, requests] = await Promise.all([
    db.leaveType.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    db.leaveRequest.findMany({
      where: { employeeId, status: { in: ["APPROVED", "PENDING"] }, startDate: yearBounds(year) },
      select: { leaveTypeId: true, status: true, days: true },
    }),
  ]);
  return types.map((t) => {
    const mine = requests.filter((r) => r.leaveTypeId === t.id);
    const used = mine.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.days, 0);
    const pending = mine.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.days, 0);
    return {
      leaveTypeId: t.id,
      code: t.code,
      name: t.name,
      quota: t.annualQuota,
      used,
      pending,
      remaining: t.annualQuota > 0 ? t.annualQuota - used - pending : null,
    };
  });
}
