import { requireUser } from "@/lib/auth";
import { getAttendance, summarize } from "@/lib/attendance-data";
import { managedEmployees } from "@/lib/team";
import { STATUS_LABEL, dateKey, formatMinutes, monthDays, parseMonth } from "@/lib/attendance";

const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** Monthly attendance as CSV: one row per employee, one column per day, then totals. */
export async function GET(request: Request) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const now = new Date();
  const { year, month } = parseMonth(new URL(request.url).searchParams.get("month") ?? undefined, now);
  const days = monthDays(year, month);
  const employees = await managedEmployees(user);
  const { days: grid, settings } = await getAttendance(
    employees.map((e) => e.id),
    days[0],
    days[days.length - 1],
    now,
  );
  const header = ["Code", "Name", ...days.map((d) => dateKey(d).slice(8)), "Present", "ID", "OD", "Absent", "Leave", "Mis-punch", "Worked", "Short", "Extra"];
  const lines = [header.map(csv).join(",")];
  for (const e of employees) {
    const mine = grid.get(e.id)!;
    const s = summarize(mine.values(), settings.workMinutesPerDay);
    const cells = days.map((d) => {
      const r = mine.get(dateKey(d))!;
      return r.status === "NOT_YET" ? "" : STATUS_LABEL[r.status].split(" · ")[0];
    });
    lines.push(
      [e.code, `${e.firstName} ${e.lastName}`.trim(), ...cells, s.present, s.incomplete, s.overtime, s.absent, s.leave, s.mispunch, formatMinutes(s.worked), formatMinutes(s.shortfall), formatMinutes(s.extra)]
        .map(csv)
        .join(","),
    );
  }
  const name = `attendance-${year}-${String(month + 1).padStart(2, "0")}.csv`;
  return new Response(lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
