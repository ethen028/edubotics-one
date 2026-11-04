import "server-only";
import { z } from "zod";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { isHrOrAdmin } from "./permissions";
import { countLeaveDays, leaveDaysInYear } from "./leave";
import { getLeaveBalances } from "./leave-balance";
import { getSettings } from "./settings";
import { todayIST } from "./time";
import { dateOnlyInput } from "./date-input";

/**
 * Asking for leave, cancelling it and deciding on it. The web forms (src/app/(app)/hr/actions.ts) and the phone
 * app (src/app/api/mobile/leave) both call these, so the rules live in one place.
 */

export type Outcome = { ok: string; error?: undefined } | { error: string; ok?: undefined };

export const leaveInput = z.object({
  leaveTypeId: z.string().min(1, "Choose a leave type."),
  startDate: dateOnlyInput,
  endDate: dateOnlyInput,
  halfDay: z.boolean().default(false),
  reason: z.string().trim().min(3, "Please add a short reason.").max(1000, "Keep the reason under 1,000 characters."),
});
export type LeaveInput = z.infer<typeof leaveInput>;

export async function requestLeave(user: CurrentUser, input: LeaveInput): Promise<Outcome> {
  const employee = user.employee;
  if (!employee) return { error: "Your login isn't linked to an employee record yet. Ask HR to link it." };
  const { leaveTypeId, startDate, endDate, reason, halfDay } = input;

  if (endDate < startDate) return { error: "End date is before start date." };
  if (endDate.getTime() - startDate.getTime() > 366 * 86400000) return { error: "Use a date range up to one year. Submit longer leave in separate requests." };
  if (halfDay && endDate.getTime() !== startDate.getTime()) return { error: "Half day is only for single-day leave." };

  const holidays = await db.holiday.findMany({
    where: { date: { gte: startDate, lte: endDate }, optional: false },
    select: { date: true },
  });
  const { weeklyOffDays } = await getSettings();
  const days = countLeaveDays(startDate, endDate, holidays.map((h) => h.date), halfDay, weeklyOffDays);
  if (days === 0) return { error: "Those dates are all weekly offs or holidays, so no leave is needed." };

  return db.$transaction(async (tx): Promise<Outcome> => {
    await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employee.id} FOR UPDATE`;
    const overlap = await tx.leaveRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlap) return { error: "You already have leave booked that overlaps these dates." };

    for (let year = startDate.getUTCFullYear(); year <= endDate.getUTCFullYear(); year++) {
      const balance = (await getLeaveBalances(employee.id, year, tx)).find((b) => b.leaveTypeId === leaveTypeId);
      if (!balance) return { error: "Choose a valid leave type." };
      const allocated = leaveDaysInYear({ startDate, endDate, days, halfDay }, year, holidays.map((holiday) => holiday.date), weeklyOffDays);
      if (balance.remaining !== null && allocated > balance.remaining) return { error: `Not enough ${balance.name} in ${year}: ${balance.remaining} day(s) available, ${allocated} requested.` };
    }

    await tx.leaveRequest.create({
      data: { employeeId: employee.id, leaveTypeId, startDate, endDate, halfDay, days, reason, approverId: employee.managerId },
    });
    return { ok: `Leave request sent for ${days} day(s).` };
  });
}

/** Someone's own pending leave, or approved leave that hasn't started. */
export async function cancelOwnLeave(user: CurrentUser, id: string): Promise<Outcome> {
  const employeeId = user.employee?.id;
  const req = await db.leaveRequest.findUnique({ where: { id } });
  if (!req || !employeeId || req.employeeId !== employeeId) return { error: "That leave request wasn't found." };
  if (req.status !== "PENDING" && !(req.status === "APPROVED" && req.startDate > todayIST())) {
    return { error: "Only pending or future leave can be cancelled." };
  }
  const changed = await db.leaveRequest.updateMany({ where: { id, employeeId, OR: [{ status: "PENDING" }, { status: "APPROVED", startDate: { gt: todayIST() } }] }, data: { status: "CANCELLED" } });
  if (!changed.count) return { error: "This leave changed in the meantime. Reload and try again." };
  return { ok: "Leave cancelled." };
}

/** The employee's manager, HR or an admin approves or rejects; nobody decides on their own leave. */
export async function decideLeaveRequest(user: CurrentUser, id: string, decision: "APPROVED" | "REJECTED", note: string | null): Promise<Outcome> {
  if (!["ADMIN", "HR", "MANAGER"].includes(user.role)) return { error: "Only a manager, HR or an admin can decide on leave." };
  const req = await db.leaveRequest.findUnique({ where: { id }, include: { employee: true } });
  if (!req || req.status !== "PENDING") return { error: "This request is no longer waiting for a decision." };
  const isTheirManager = user.employee && req.employee.managerId === user.employee.id;
  if (!isHrOrAdmin(user) && !isTheirManager) return { error: "Only their manager, HR or an admin can decide on this leave." };
  if (req.employeeId === user.employee?.id) return { error: "You can't approve your own leave." };
  const changed = await db.leaveRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: decision, decisionNote: note, decidedAt: new Date(), approverId: user.employee?.id ?? req.approverId },
  });
  if (!changed.count) return { error: "This request is no longer waiting for a decision." };
  return { ok: decision === "APPROVED" ? "Leave approved." : "Leave rejected." };
}
