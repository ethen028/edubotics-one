import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { countLeaveDays } from "./leave";
import { calculateSlip, employedDaysIn, monthRange, type Manual } from "./payroll";

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);

/** The salary row in force for a month: the latest one effective on or before the month's last day. */
export async function salaryFor(employeeId: string, month: string) {
  const { end } = monthRange(month);
  const s = await db.salaryStructure.findFirst({
    where: { employeeId, effectiveFrom: { lte: end } },
    orderBy: { effectiveFrom: "desc" },
  });
  return s && { basic: num(s.basic), hra: num(s.hra), specialAllowance: num(s.specialAllowance) };
}

/** Working days of approved unpaid (LOP) leave inside the month. */
export async function lopLeaveDays(employeeId: string, month: string) {
  const { start, end } = monthRange(month);
  const [settings, leaves, holidays] = await Promise.all([
    getSettings(),
    db.leaveRequest.findMany({
      where: { employeeId, status: "APPROVED", leaveType: { paid: false }, startDate: { lte: end }, endDate: { gte: start } },
    }),
    db.holiday.findMany({ where: { date: { gte: start, lte: end }, optional: false }, select: { date: true } }),
  ]);
  return leaves.reduce((sum, l) => {
    const from = l.startDate > start ? l.startDate : start;
    const to = l.endDate < end ? l.endDate : end;
    const whole = from.getTime() === l.startDate.getTime() && to.getTime() === l.endDate.getTime();
    // A half-day request is only half when it lies wholly inside this month.
    return sum + countLeaveDays(from, to, holidays.map((h) => h.date), whole && l.halfDay, settings.weeklyOffDays);
  }, 0);
}

/** Computes a payslip for one employee, or null when they have no salary or weren't employed that month. */
export async function draftSlip(
  employee: { id: string; dateOfJoining: Date; dateOfExit: Date | null },
  month: string,
  opts: { lopDays?: number; manual?: Partial<Manual> } = {},
) {
  const structure = await salaryFor(employee.id, month);
  const employedDays = employedDaysIn(month, employee.dateOfJoining, employee.dateOfExit);
  if (!structure || employedDays === 0) return null;
  const settings = await getSettings();
  return calculateSlip({
    structure,
    daysInMonth: monthRange(month).days,
    employedDays,
    lopDays: opts.lopDays ?? (await lopLeaveDays(employee.id, month)),
    manual: { otherEarnings: 0, professionalTax: 0, tds: 0, otherDeductions: 0, ...opts.manual },
    rules: settings,
  });
}
