import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { isAdmin, isManagerOrAdmin, type CurrentUser } from "./auth";

/**
 * Everything waiting on this user's decision, in one place: leave, missed punch-outs,
 * timesheets, project approvals, kit/part requests and purchase orders. Admins see everyone's; managers their direct reports'.
 */
export async function pendingApprovals(user: CurrentUser) {
  if (!isManagerOrAdmin(user)) return { leave: [], corrections: [], timesheets: [], projects: [], stock: [], purchases: [], total: 0 };
  const me = user.employee?.id ?? "__none__";
  const team: Prisma.EmployeeWhereInput = isAdmin(user) ? {} : { managerId: me };

  const [leave, corrections, timesheets, projects, stock, purchases] = await Promise.all([
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
    db.project.findMany({
      where: {
        stage: "APPROVAL",
        ownerId: { not: user.id },
        ...(isAdmin(user) ? {} : { owner: { employee: { managerId: me } } }),
      },
      include: { owner: { select: { name: true } }, tasks: { select: { status: true } } },
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
  ]);
  return {
    leave,
    corrections,
    timesheets,
    projects,
    stock,
    purchases,
    total: leave.length + corrections.length + timesheets.length + projects.length + stock.length + purchases.length,
  };
}
