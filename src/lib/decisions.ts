import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { canManage, canManageHrEmployee } from "./team";
import { canApproveProject } from "./projects";
import { canApproveRequest } from "./inventory";
import { canApproveOrder } from "./purchases";
import { notify } from "./notifications";
import { formatDate, toDateInput } from "./format";

/**
 * Approve or reject what waits in Approvals. The web Approvals page (through each module's server actions) and
 * the phone app (src/app/api/mobile/approvals) both call these, so who may decide and what a decision does live
 * in one place. Leave is in src/lib/leave-requests.ts.
 *
 * `gone` means the item was already decided or deleted: the web forms ignore that quietly, as before.
 */

export type Decision = "APPROVED" | "REJECTED";
export type DecisionOutcome = { ok: string; error?: undefined; gone?: undefined } | { error: string; ok?: undefined; gone?: boolean };

const GONE: DecisionOutcome = { error: "This was already decided. Pull down to refresh.", gone: true };
const NOT_YOURS: DecisionOutcome = { error: "You can't decide on this one." };
const said = (d: Decision, yes: string, no: string): DecisionOutcome => ({ ok: d === "APPROVED" ? yes : no });

/** A missed punch-out: approving fills in the check-out time the person asked for. */
export async function decideCorrectionRequest(user: CurrentUser, id: string, decision: Decision): Promise<DecisionOutcome> {
  if (!["ADMIN", "HR", "MANAGER"].includes(user.role)) return NOT_YOURS;
  const req = await db.attendanceCorrection.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return GONE;
  if (!(await canManageHrEmployee(user, req.employeeId)) || req.employeeId === user.employee?.id) return NOT_YOURS;
  try {
    const done = await db.$transaction(async (tx) => {
      const changed = await tx.attendanceCorrection.updateMany({ where: { id, status: "PENDING" }, data: { status: decision, decidedById: user.id, decidedAt: new Date() } });
      if (!changed.count) return false;
      if (decision === "APPROVED") {
        const corrected = await tx.attendanceSession.updateMany({ where: { id: req.sessionId, checkOut: null }, data: { checkOut: req.requestedCheckOut } });
        if (!corrected.count) throw new Error("The attendance session changed. Reload before deciding.");
      }
      return true;
    });
    if (!done) return GONE;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not saved. Try again." };
  }
  return said(decision, "Check-out fixed.", "Correction rejected.");
}

export async function decideTimesheetRequest(user: CurrentUser, id: string, decision: Decision, note: string | null): Promise<DecisionOutcome> {
  if (!["ADMIN", "MANAGER"].includes(user.role)) return NOT_YOURS;
  const sheet = await db.timesheet.findUnique({ where: { id } });
  if (!sheet || sheet.status !== "SUBMITTED") return GONE;
  if (sheet.employeeId === user.employee?.id || !(await canManage(user, sheet.employeeId))) return NOT_YOURS;
  const changed = await db.timesheet.updateMany({
    where: { id, status: "SUBMITTED" },
    data: { status: decision, decisionNote: note, decidedById: user.id, decidedAt: new Date() },
  });
  if (!changed.count) return GONE;
  const employee = await db.employee.findUnique({ where: { id: sheet.employeeId }, select: { userId: true } });
  await notify([employee?.userId], user.id, {
    kind: "timesheet.decided",
    title: `${user.name} ${decision === "APPROVED" ? "approved" : "sent back"} your timesheet for the week of ${formatDate(sheet.weekStart)}`,
    body: note,
    href: `/timesheets?week=${toDateInput(sheet.weekStart)}`,
  });
  return said(decision, "Timesheet approved.", "Timesheet sent back.");
}

/** An expense claim, optionally approved for less than was claimed (never more). */
export async function decideClaimRequest(user: CurrentUser, id: string, decision: Decision, note: string | null, approvedAmount?: number | null): Promise<DecisionOutcome> {
  if (!["ADMIN", "MANAGER"].includes(user.role)) return NOT_YOURS;
  const claim = await db.expenseClaim.findUnique({ where: { id } });
  if (!claim || claim.status !== "SUBMITTED") return GONE;
  if (claim.employeeId === user.employee?.id || !(await canManage(user, claim.employeeId))) return NOT_YOURS;
  const claimed = Number(claim.amount);
  const amount = approvedAmount == null ? claimed : Math.min(claimed, Math.max(0, approvedAmount || 0));
  if (decision === "APPROVED" && amount <= 0) return { error: "Approve an amount above zero, or reject the claim." };
  const changed = await db.expenseClaim.updateMany({
    where: { id, status: "SUBMITTED" },
    data: { status: decision, approvedAmount: decision === "APPROVED" ? amount : null, decisionNote: note, decidedById: user.id, decidedAt: new Date() },
  });
  if (!changed.count) return GONE;
  return said(decision, "Claim approved.", "Claim rejected.");
}

/** A project at the Approval gate: approved moves it to Handover, rejected sends it back to Review. */
export async function decideProjectApproval(user: CurrentUser, id: string, decision: Decision, note: string | null): Promise<DecisionOutcome> {
  if (!["ADMIN", "MANAGER"].includes(user.role)) return NOT_YOURS;
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.stage !== "APPROVAL") return GONE;
  if (!(await canApproveProject(user, project))) return NOT_YOURS;
  const changed = await db.project.updateMany({
    where: { id, stage: "APPROVAL" },
    data: { stage: decision === "APPROVED" ? "HANDOVER" : "REVIEW", approvalNote: note, decidedById: user.id, decidedAt: new Date() },
  });
  if (!changed.count) return GONE;
  await notify([project.ownerId], user.id, {
    kind: "project.decided",
    title: decision === "APPROVED" ? `${project.name} was approved` : `${project.name} was sent back`,
    body: note,
    href: `/projects/${id}`,
  });
  return said(decision, "Project approved.", "Project sent back.");
}

export async function decideStockRequestDecision(user: CurrentUser, id: string, decision: Decision, note: string | null): Promise<DecisionOutcome> {
  if (!["ADMIN", "MANAGER"].includes(user.role)) return NOT_YOURS;
  const request = await db.stockRequest.findUnique({ where: { id } });
  if (!request || request.status !== "PENDING") return GONE;
  if (!(await canApproveRequest(user, request))) return NOT_YOURS;
  const changed = await db.stockRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: decision, decisionNote: note, decidedById: user.id, decidedAt: new Date(), closedAt: decision === "REJECTED" ? new Date() : null },
  });
  if (!changed.count) return GONE;
  return said(decision, "Request approved.", "Request rejected.");
}

export async function decidePurchaseOrderDecision(user: CurrentUser, id: string, decision: Decision, note: string | null): Promise<DecisionOutcome> {
  if (!["ADMIN", "MANAGER"].includes(user.role)) return NOT_YOURS;
  const order = await db.purchaseOrder.findUnique({ where: { id } });
  if (!order || order.status !== "PENDING") return GONE;
  if (!(await canApproveOrder(user, order))) return NOT_YOURS;
  const changed = await db.purchaseOrder.updateMany({
    where: { id, status: "PENDING" },
    data: { status: decision, decisionNote: note, decidedById: user.id, decidedAt: new Date(), closedAt: decision === "REJECTED" ? new Date() : null },
  });
  if (!changed.count) return GONE;
  return said(decision, "Purchase order approved.", "Purchase order rejected.");
}
