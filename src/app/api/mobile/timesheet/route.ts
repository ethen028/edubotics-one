import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDateOnly } from "@/lib/leave";
import { projectScope } from "@/lib/projects";
import { limitedJson } from "@/lib/request-body";
import { todayIST } from "@/lib/time";
import { logTime } from "@/lib/timesheet-entries";
import { addDays, mondayOf, weekDays } from "@/lib/week";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
const day = (d: Date) => d.toISOString().slice(0, 10);

/** The phone's Timesheet: one week's entries, hours per day, and the tasks and projects time can be logged against. */
export async function GET(request: Request) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const user = access.user;
  if (!user.employee) return Response.json({ error: "Timesheets need an employee record linked to your login. Ask an admin." }, { status: 409, headers: noStore });
  const today = todayIST();
  let weekStart = mondayOf(today);
  const asked = new URL(request.url).searchParams.get("week");
  try {
    if (asked) weekStart = mondayOf(parseDateOnly(asked));
  } catch {}

  const [sheet, projects, tasks] = await Promise.all([
    db.timesheet.findUnique({
      where: { employeeId_weekStart: { employeeId: user.employee.id, weekStart } },
      include: {
        entries: {
          include: { project: { select: { name: true } }, task: { select: { title: true } } },
          orderBy: [{ date: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    db.project.findMany({ where: { ...projectScope(user), stage: { not: "COMPLETE" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.projectTask.findMany({
      where: { assigneeId: user.id, OR: [{ status: { not: "DONE" } }, { completedAt: { gte: addDays(today, -14) } }] },
      select: { id: true, title: true, status: true, progress: true, project: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const entries = sheet?.entries ?? [];
  const status = sheet?.status ?? "DRAFT";
  return Response.json({
    today: day(today),
    weekStart: day(weekStart),
    sheetId: sheet?.id ?? null,
    status,
    decisionNote: sheet?.decisionNote ?? null,
    open: status !== "SUBMITTED" && status !== "APPROVED",
    total: entries.reduce((s, e) => s + Number(e.hours), 0),
    days: weekDays(weekStart).map((d) => ({
      date: day(d),
      hours: entries.filter((e) => e.date.getTime() === d.getTime()).reduce((s, e) => s + Number(e.hours), 0),
    })),
    entries: entries.map((e) => ({
      id: e.id,
      date: day(e.date),
      hours: Number(e.hours),
      startTime: e.startTime,
      endTime: e.endTime,
      title: e.title,
      note: e.note,
      project: e.project?.name ?? null,
      task: e.task?.title ?? null,
      workStatus: e.workStatus,
    })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, project: t.project.name, progress: t.status === "DONE" ? 100 : t.progress })),
    projects,
  }, { headers: noStore });
}

const entry = z.object({
  date: z.string().max(10),
  target: z.string().max(120).optional(),
  hours: z.string().max(6).optional(),
  startTime: z.string().max(5).optional(),
  endTime: z.string().max(5).optional(),
  title: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
  workStatus: z.string().max(20).optional(),
  progress: z.string().max(3).optional(),
});

/** Logs time from the phone, with the same checks as the web form (src/lib/timesheet-entries.ts). Files stay on the web. */
export async function POST(request: Request) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const parsed = entry.safeParse(await limitedJson(request));
  if (!parsed.success) return Response.json({ error: "Something was missing. Check the form and try again." }, { status: 400, headers: noStore });
  const result = await logTime(access.user, parsed.data);
  return Response.json({ ok: result.ok, error: result.error }, { status: result.error ? 400 : 200, headers: noStore });
}
