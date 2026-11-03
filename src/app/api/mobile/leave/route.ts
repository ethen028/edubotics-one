import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLeaveBalances } from "@/lib/leave-balance";
import { leaveInput, requestLeave } from "@/lib/leave-requests";
import { limitedJson } from "@/lib/request-body";
import { todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
const day = (d: Date) => d.toISOString().slice(0, 10);

/** The phone's My leave: balances this year, leave types, recent requests and the next holidays. */
export async function GET() {
  const access = await getApiUser();
  if (access.error) return access.error;
  const employee = access.user.employee;
  if (!employee) return Response.json({ error: "Your login isn't linked to an employee record yet. Ask HR to link it." }, { status: 409, headers: noStore });
  const today = todayIST();
  const [balances, requests, holidays] = await Promise.all([
    getLeaveBalances(employee.id),
    db.leaveRequest.findMany({
      where: { employeeId: employee.id },
      include: { leaveType: { select: { name: true, code: true } }, approver: { select: { firstName: true, lastName: true } } },
      orderBy: { startDate: "desc" },
      take: 50,
    }),
    db.holiday.findMany({ where: { date: { gte: today } }, orderBy: { date: "asc" }, take: 8, select: { date: true, name: true, optional: true } }),
  ]);
  return Response.json({
    year: today.getUTCFullYear(),
    today: day(today),
    balances,
    requests: requests.map((r) => ({
      id: r.id,
      type: r.leaveType.name,
      code: r.leaveType.code,
      startDate: day(r.startDate),
      endDate: day(r.endDate),
      halfDay: r.halfDay,
      days: r.days,
      reason: r.reason,
      status: r.status,
      approver: r.approver ? `${r.approver.firstName} ${r.approver.lastName}` : null,
      decisionNote: r.decisionNote,
      canCancel: r.status === "PENDING" || (r.status === "APPROVED" && r.startDate > today),
    })),
    holidays: holidays.map((h) => ({ date: day(h.date), name: h.name, optional: h.optional })),
  }, { headers: noStore });
}

/** Asks for leave, with the same checks as the web form (src/lib/leave-requests.ts). */
export async function POST(request: Request) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const body = await limitedJson(request);
  if (!body) return Response.json({ error: "The request was empty or too large. Try again." }, { status: 400, headers: noStore });
  const parsed = leaveInput.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the form and try again." }, { status: 400, headers: noStore });
  const result = await requestLeave(access.user, parsed.data);
  return Response.json(result, { status: result.error ? 400 : 200, headers: noStore });
}
