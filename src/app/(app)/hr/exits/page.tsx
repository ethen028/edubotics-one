import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { exitScope } from "@/lib/exits";
import { EXIT_KIND_LABEL } from "@/lib/exit-math";
import { todayIST } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Exits" };

const DAY = 86_400_000;

export default async function ExitsPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const admin = isAdmin(user);
  const today = todayIST();
  const yearAgo = new Date(today.getTime() - 365 * DAY);
  const include = {
    employee: { select: { id: true, firstName: true, lastName: true, designation: true, code: true, _count: { select: { assets: { where: { status: "ASSIGNED" as const } } } } } },
    tasks: { select: { doneAt: true } },
  };
  const [requested, onNotice, left, withdrawn] = await Promise.all([
    db.employeeExit.findMany({ where: { ...exitScope(user), stage: "REQUESTED" }, include, orderBy: { noticeGivenOn: "asc" } }),
    db.employeeExit.findMany({ where: { ...exitScope(user), stage: "ON_NOTICE" }, include, orderBy: { lastWorkingDay: "asc" } }),
    db.employeeExit.findMany({
      where: { ...exitScope(user), stage: "LEFT", lastWorkingDay: { gte: yearAgo } },
      include,
      orderBy: { lastWorkingDay: "desc" },
    }),
    db.employeeExit.findMany({ where: { ...exitScope(user), stage: "WITHDRAWN" }, include, orderBy: { withdrawnAt: "desc" }, take: 5 }),
  ]);
  const name = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();
  const reasons = new Map<string, number>();
  for (const x of left) if (x.interviewReason) reasons.set(x.interviewReason, (reasons.get(x.interviewReason) ?? 0) + 1);
  const topReasons = [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <>
      <PageHeader
        title="Exits"
        subtitle="Resignations, notice periods, leaving checklists, handover and final settlement. People resign from their own profile."
        actions={
          admin && (
            <Link href="/hr/exits/new" className="btn-primary">
              Record an exit
            </Link>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Waiting for acceptance", requested.length],
            ["Serving notice", onNotice.length],
            ["Left in the last 12 months", left.length],
            ["Leaving this month", onNotice.filter((x) => x.lastWorkingDay && x.lastWorkingDay.getUTCMonth() === today.getUTCMonth() && x.lastWorkingDay.getUTCFullYear() === today.getUTCFullYear()).length],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="card p-3">
            <div className="text-2xl font-semibold">{v}</div>
            <div className="text-xs text-slate-500">{k}</div>
          </div>
        ))}
      </div>

      {requested.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">
            Resignations to accept <Badge color="amber">{requested.length}</Badge>
          </h2>
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Resigned on</th>
                  <th>Last day they asked for</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requested.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <div className="font-medium">{name(x.employee)}</div>
                      <div className="text-xs text-slate-500">{x.employee.designation}</div>
                    </td>
                    <td>{formatDate(x.noticeGivenOn)}</td>
                    <td>{formatDate(x.proposedLastDay)}</td>
                    <td className="text-right">
                      <Link href={`/hr/exits/${x.id}`} className="btn-primary btn-sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Serving notice</h2>
        {onNotice.length === 0 ? (
          <Empty>Nobody is serving notice.</Empty>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Why</th>
                  <th>Last working day</th>
                  <th>Checklist</th>
                  <th>Assets still out</th>
                  {admin && <th>Settlement</th>}
                </tr>
              </thead>
              <tbody>
                {onNotice.map((x) => {
                  const left = x.lastWorkingDay ? Math.round((x.lastWorkingDay.getTime() - today.getTime()) / DAY) : null;
                  const done = x.tasks.filter((t) => t.doneAt).length;
                  return (
                    <tr key={x.id}>
                      <td>
                        <Link href={`/hr/exits/${x.id}`} className="link font-medium">
                          {name(x.employee)}
                        </Link>
                        <div className="text-xs text-slate-500">{x.employee.designation}</div>
                      </td>
                      <td>{EXIT_KIND_LABEL[x.kind]}</td>
                      <td className="whitespace-nowrap">
                        {formatDate(x.lastWorkingDay)}
                        <div className={`text-xs ${left !== null && left < 0 ? "font-medium text-red-600" : "text-slate-500"}`}>
                          {left === null ? "" : left > 0 ? `${left} day${left === 1 ? "" : "s"} to go` : left === 0 ? "Today" : "Passed: mark as left"}
                        </div>
                      </td>
                      <td>
                        {done}/{x.tasks.length}
                      </td>
                      <td>{x.employee._count.assets ? <Badge color="amber">{x.employee._count.assets}</Badge> : "None"}</td>
                      {admin && (
                        <td>
                          {x.settlementAgreedAt ? <Badge color="green">Agreed</Badge> : <span className="text-slate-400">Not yet</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Left in the last 12 months</h2>
        {left.length === 0 ? (
          <Empty>Nobody has left in the last 12 months.</Empty>
        ) : (
          <>
            {admin && topReasons.length > 0 && (
              <p className="mb-2 text-sm text-slate-600">
                Main reasons from exit interviews: {topReasons.map(([r, n]) => `${r} (${n})`).join(", ")}
              </p>
            )}
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Why</th>
                    <th>Last working day</th>
                    {admin && <th>Main reason</th>}
                    {admin && <th>Would rehire</th>}
                  </tr>
                </thead>
                <tbody>
                  {left.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <Link href={`/hr/exits/${x.id}`} className="link">
                          {name(x.employee)}
                        </Link>
                        <div className="text-xs text-slate-500">{x.employee.designation}</div>
                      </td>
                      <td>{EXIT_KIND_LABEL[x.kind]}</td>
                      <td>{formatDate(x.lastWorkingDay)}</td>
                      {admin && <td>{x.interviewReason ?? <span className="text-slate-400">No exit interview</span>}</td>}
                      {admin && <td>{x.rehireEligible == null ? "—" : x.rehireEligible ? "Yes" : "No"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {withdrawn.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Recently withdrawn</h2>
          <ul className="card divide-y divide-slate-100 p-0 text-sm">
            {withdrawn.map((x) => (
              <li key={x.id} className="px-5 py-2">
                <Link href={`/hr/exits/${x.id}`} className="link">
                  {name(x.employee)}
                </Link>{" "}
                <span className="text-slate-500">
                  · {EXIT_KIND_LABEL[x.kind].toLowerCase()} withdrawn {formatDate(x.withdrawnAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
