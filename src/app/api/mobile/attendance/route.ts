import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { istDate } from "@/lib/attendance";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
const schema = z.object({ action: z.enum(["check-in", "check-out"]) });
export async function POST(request: Request) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const employee = access.user.employee;
  if (!employee) return Response.json({ error: "Your account is not linked to an employee record." }, { status: 409, headers: noStore });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400, headers: noStore }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose check-in or check-out." }, { status: 400, headers: noStore });
  const now = new Date();
  const today = istDate(now);
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employee.id} FOR UPDATE`;
    const open = await tx.attendanceSession.findFirst({ where: { employeeId: employee.id, workDate: today, checkOut: null }, orderBy: { checkIn: "desc" } });
    if (parsed.data.action === "check-in") {
      if (open) return { session: open, message: "You are already checked in." };
      const session = await tx.attendanceSession.create({ data: { employeeId: employee.id, workDate: today, checkIn: now } });
      return { session, message: "Check-in recorded." };
    }
    if (!open) return { session: null, message: "No active check-in was found for today." };
    const session = await tx.attendanceSession.update({ where: { id: open.id }, data: { checkOut: now } });
    return { session, message: "Check-out recorded." };
  });
  if (!result.session) return Response.json({ error: result.message }, { status: 409, headers: noStore });
  return Response.json({ message: result.message, session: result.session, checkedIn: !result.session.checkOut }, { headers: noStore });
}
