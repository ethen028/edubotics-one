import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { isAdmin, isManagerOrAdmin, type CurrentUser } from "./auth";

/**
 * Everything waiting on this user's decision, in one place: leave, missed punch-outs,
 * timesheets and project approvals. Admins see everyone's; managers their direct reports'.
 */
export async function pendingApprovals(user: CurrentUser) {
  if (!isManagerOrAdmin(user)) return { leave: [], corrections: [], timesheets: [], projects: [], total: 0 };
  const me = user.employee?.id ?? "__none__";
  const team: Prisma.EmployeeWhereInput = isAdmin(user) ? {} : { managerId: me };

  const [leave, corrections, timesheets, projects] = await Promise.all([
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
  ]);
  return {
    leave,
    corrections,
    timesheets,
    projects,
    total: leave.length + corrections.length + timesheets.length + projects.length,
  };
}
