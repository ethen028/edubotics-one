import "server-only";
import { db, type Tx } from "./db";
import { leaveDaysInYear, yearBounds } from "./leave";
import { getSettings } from "./settings";
import { todayIST } from "./time";

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
export async function getLeaveBalances(employeeId: string, year = todayIST().getUTCFullYear(), client: Pick<Tx, "leaveType" | "leaveRequest" | "holiday"> = db): Promise<LeaveBalance[]> {
  const bounds = yearBounds(year);
  const [types, requests, holidays, settings] = await Promise.all([
    client.leaveType.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    client.leaveRequest.findMany({
      where: { employeeId, status: { in: ["APPROVED", "PENDING"] }, startDate: { lt: bounds.lt }, endDate: { gte: bounds.gte } },
      select: { leaveTypeId: true, status: true, days: true, startDate: true, endDate: true, halfDay: true },
    }),
    client.holiday.findMany({ where: { date: bounds, optional: false }, select: { date: true } }),
    getSettings(),
  ]);
  return types.map((t) => {
    const mine = requests.filter((r) => r.leaveTypeId === t.id);
    const days = (request: typeof requests[number]) => leaveDaysInYear(request, year, holidays.map(holiday => holiday.date), settings.weeklyOffDays);
    const used = mine.filter((r) => r.status === "APPROVED").reduce((s, r) => s + days(r), 0);
    const pending = mine.filter((r) => r.status === "PENDING").reduce((s, r) => s + days(r), 0);
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
