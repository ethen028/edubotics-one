import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { isAdmin, isManagerOrAdmin, type CurrentUser } from "./auth";
import { resignationsToAccept } from "./exits";

/**
 * Everything waiting on this user's decision, in one place: leave, missed punch-outs,
 * timesheets, expense claims, project approvals, kit/part requests, purchase orders and resignations. Admins see everyone's; managers their direct reports'.
 */
export async function pendingApprovals(user: CurrentUser) {
  if (!isManagerOrAdmin(user))
    return { leave: [], corrections: [], timesheets: [], claims: [], projects: [], stock: [], purchases: [], resignations: [], total: 0 };
  const me = user.employee?.id ?? "__none__";
  const team: Prisma.EmployeeWhereInput = isAdmin(user) ? {} : { managerId: me };

  const [leave, corrections, timesheets, claims, projects, stock, purchases, resignations] = await Promise.all([
    db.leaveRequest.findMany({
      where: { status: "PENDING", employeeId: { not: me }, employee: team },
      include: { employee: true, leaveType: true },
      orderBy: { startDate: "asc" },
    }),
    db.attendanceCorrection.findMany({
      where: { status: "PENDING", employeeId: { not: me }, employee: team },
      include: { employee: true, session: true },
      orderBy: { createdAt: "asc" },
    }),
    db.timesheet.findMany({
      where: { status: "SUBMITTED", employeeId: { not: me }, employee: team },
      include: {
        employee: true,
        entries: { include: { project: { select: { name: true } } }, orderBy: { date: "asc" } },
      },
      orderBy: { weekStart: "asc" },
    }),
    db.expenseClaim.findMany({
      where: { status: "SUBMITTED", employeeId: { not: me }, employee: team },
      include: {
        employee: true,
        project: { select: { name: true } },
        organization: { select: { name: true } },
        receipt: { select: { id: true } },
      },
      orderBy: { date: "asc" },
    }),
    db.project.findMany({
      where: {
        stage: "APPROVAL",
        ownerId: { not: user.id },
        ...(isAdmin(user) ? {} : { owner: { employee: { managerId: me } } }),
      },
      include: { owner: { select: { name: true } }, tasks: { select: { status: true, progress: true } } },
      orderBy: { updatedAt: "asc" },
    }),
    db.stockRequest.findMany({
      where: {
        status: "PENDING",
        requesterId: { not: user.id },
        ...(isAdmin(user) ? {} : { requester: { employee: { managerId: me } } }),
      },
      include: {
        requester: { select: { name: true } },
        project: { select: { id: true, name: true } },
        lines: { include: { item: { select: { name: true, unit: true, onHand: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.purchaseOrder.findMany({
      where: {
        status: "PENDING",
        requesterId: { not: user.id },
        ...(isAdmin(user) ? {} : { requester: { employee: { managerId: me } } }),
      },
      include: {
        requester: { select: { name: true } },
        vendor: { select: { name: true } },
        project: { select: { id: true, name: true } },
        lines: { select: { description: true, quantity: true, unit: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    resignationsToAccept(user),
  ]);
  return {
    leave,
    corrections,
    timesheets,
    claims,
    projects,
    stock,
    purchases,
    resignations,
    total:
      leave.length +
      corrections.length +
      timesheets.length +
      claims.length +
      projects.length +
      stock.length +
      purchases.length +
      resignations.length,
  };
}
