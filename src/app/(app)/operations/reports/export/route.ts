import { requireUser } from "@/lib/auth";
import { dateKey } from "@/lib/attendance";
import { monthSessions } from "../month";

const csv = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** One row per session in the month, for invoicing schools or checking trainer hours. */
export async function GET(request: Request) {
  await requireUser(["ADMIN", "MANAGER"]);
  const { key, sessions } = await monthSessions(new URL(request.url).searchParams.get("month") ?? undefined);
  const rows = [
    ["Date", "Start", "Minutes", "School", "Programme", "Class", "Trainer", "Status", "Students present", "Taught", "Notes", "Issues"],
    ...sessions.map((s) => [
      dateKey(s.date),
      s.startTime,
      s.durationMins,
      s.programme.organization.name,
      s.programme.name,
      s.classGroup,
      s.trainer?.name ?? null,
      s.status,
      s.studentsPresent,
      s.covered,
      s.notes,
      s.issues,
    ]),
  ];
  return new Response(rows.map((r) => r.map(csv).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="school-sessions-${key}.csv"` },
  });
}
