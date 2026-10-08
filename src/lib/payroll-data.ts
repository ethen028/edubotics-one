import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { countLeaveDays } from "./leave";
import { calculateSlip, employedDaysIn, monthRange, type Manual } from "./payroll";
import { dayRate, settlementAmounts } from "./exit-math";

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

/**
 * Approved expense claims not yet paid or on another payroll, spent on or before the month's last day.
 * They are paid back with this month's salary.
 */
export function claimsDueFor(employeeId: string, month: string) {
  return db.expenseClaim.findMany({
    where: { employeeId, status: "APPROVED", payslipId: null, date: { lte: monthRange(month).end } },
    select: { id: true, amount: true, approvedAmount: true },
  });
}

/**
 * The agreed final settlement of someone whose last working day falls in this month, or null.
 * Day counts are paid at the rate of the salary in force that month.
 */
export async function settlementFor(employeeId: string, month: string, structure: { basic: number; hra: number; specialAllowance: number }, lopDivisor: number) {
  const { start, end } = monthRange(month);
  const exit = await db.employeeExit.findFirst({
    where: { employeeId, stage: { in: ["ON_NOTICE", "LEFT"] }, settlementAgreedAt: { not: null }, lastWorkingDay: { gte: start, lte: end } },
  });
  return exit && settlementAmounts(exit, dayRate(structure, lopDivisor));
}

/** Computes a payslip for one employee, or null when they have no salary or weren't employed that month. */
export async function draftSlip(
  employee: { id: string; dateOfJoining: Date; dateOfExit: Date | null },
  month: string,
  opts: { lopDays?: number; manual?: Partial<Manual>; reimbursements?: number } = {},
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
    reimbursements: opts.reimbursements,
    settlement: await settlementFor(employee.id, month, structure, settings.lopDivisor),
  });
}
