import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { istDate } from "@/lib/attendance";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
export async function GET() {
  const access = await getApiUser();
  if (access.error) return access.error;
  const { user } = access;
  const employee = user.employee;
  if (!employee) return Response.json({ error: "Your account is not linked to an employee record. Contact an administrator." }, { status: 409, headers: noStore });
  const today = istDate(new Date());
  const [sessions, pendingLeave] = await Promise.all([
    db.attendanceSession.findMany({ where: { employeeId: employee.id, workDate: today }, orderBy: { checkIn: "asc" }, select: { id: true, checkIn: true, checkOut: true, workDate: true } }),
    db.leaveRequest.count({ where: { employeeId: employee.id, status: "PENDING" } }),
  ]);
  const openSession = [...sessions].reverse().find((s) => !s.checkOut) ?? null;
  return Response.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, employee: { id: employee.id, code: employee.code, designation: employee.designation, department: employee.departmentId } },
    date: today.toISOString().slice(0, 10),
    attendance: { sessions, openSession, checkedIn: Boolean(openSession), pendingLeave },
  }, { headers: noStore });
}
