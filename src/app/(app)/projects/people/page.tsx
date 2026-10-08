import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { todayIST } from "@/lib/time";
import { mondayOf } from "@/lib/week";
import { ProgressBar } from "../ui";

export const metadata = { title: "Team workload" };

const FILTERS = { all: "Everyone", busy: "Has open work", free: "No open work" } as const;

/** Task Flow's Employees view: who is carrying what across all projects. Admins see everyone, managers their reports. */
export default async function WorkloadPage({ searchParams }: PageProps<"/projects/people">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const filter = (sp.show && sp.show in FILTERS ? sp.show : "all") as keyof typeof FILTERS;
  const dept = sp.dept ?? "";
  const today = todayIST();
  const weekStart = mondayOf(today);

  const [people, departments] = await Promise.all([
    db.user.findMany({
      where: {
        active: true,
        ...(isAdmin(user) ? {} : { OR: [{ id: user.id }, { employee: { managerId: user.employee?.id ?? "__none__" } }] }),
        ...(dept ? { employee: { departmentId: dept } } : {}),
      },
      select: {
        id: true,
        name: true,
        employee: {
          select: {
            designation: true,
            department: { select: { name: true } },
            timesheets: { where: { weekStart }, select: { entries: { select: { hours: true } } } },
          },
        },
        assignedTasks: {
          where: { project: { stage: { not: "COMPLETE" } } },
          select: { status: true, progress: true, dueDate: true, updateRequestedAt: true, projectId: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const rows = people
    .map((p) => {
      const open = p.assignedTasks.filter((t) => t.status !== "DONE");
      return {
        ...p,
        open: open.length,
        projects: new Set(open.map((t) => t.projectId)).size,
        overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
        requested: open.filter((t) => t.updateRequestedAt).length,
        done: p.assignedTasks.length - open.length,
        avg: open.length ? Math.round(open.reduce((s, t) => s + t.progress, 0) / open.length) : null,
        hours: p.employee?.timesheets[0]?.entries.reduce((s, e) => s + Number(e.hours), 0) ?? 0,
      };
    })
    .filter((r) => (filter === "busy" ? r.open > 0 : filter === "free" ? r.open === 0 : true));

  const link = (show: string, d = dept) => `?${new URLSearchParams({ ...(show !== "all" ? { show } : {}), ...(d ? { dept: d } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Team workload"
        subtitle={isAdmin(user) ? "Open tasks across all active projects" : "You and the people who report to you"}
        actions={
          <Link href="/projects" className="btn-secondary">
            All projects
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.entries(FILTERS).map(([k, label]) => (
          <Link key={k} href={link(k)} className={k === filter ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
            {label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          {filter !== "all" && <input type="hidden" name="show" value={filter} />}
          <select name="dept" defaultValue={dept} className="input w-auto py-1 text-sm">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button className="btn-secondary btn-sm">Filter</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <Empty>No one matches.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Department</th>
                <th className="text-right">Open tasks</th>
                <th className="text-right">Projects</th>
                <th className="text-right">Overdue</th>
                <th className="text-right">Completed</th>
                <th>Avg. progress</th>
                <th className="text-right">Hours this week</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      {r.employee?.designation ?? ""}
                      {r.requested > 0 && <span className="ml-1 text-amber-700">· {r.requested} update request(s)</span>}
                    </div>
                  </td>
                  <td className="text-slate-600">{r.employee?.department?.name ?? "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{r.open}</td>
                  <td className="text-right tabular-nums">{r.projects}</td>
                  <td className={`text-right tabular-nums ${r.overdue ? "font-semibold text-red-600" : "text-slate-400"}`}>{r.overdue}</td>
                  <td className="text-right tabular-nums">{r.done}</td>
                  <td className="w-40">
                    {r.avg === null ? (
                      <span className="text-xs text-slate-400">No open work</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <ProgressBar value={r.avg} className="flex-1" />
                        <span className="w-9 text-right text-xs tabular-nums">{r.avg}%</span>
                      </div>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{r.hours || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
