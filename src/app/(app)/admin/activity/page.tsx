import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_AREAS, FAILED_SIGN_IN, recentFailedSignIns, type ActivityArea } from "@/lib/activity";
import { formatDateTime } from "@/lib/format";
import { Badge, Empty, Field, PageHeader } from "@/components/ui";

export const metadata = { title: "Activity log" };

const PAGE = 100;
const areaColor: Record<ActivityArea, "gray" | "blue" | "green" | "amber" | "red" | "purple"> = {
  SIGN_IN: "blue",
  LOGINS: "purple",
  SETTINGS: "gray",
  PAYROLL: "green",
  MONEY: "amber",
  HR: "gray",
  DELETED: "red",
};

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requireUser(["ADMIN"]);
  const { area, person, before, problems } = (await searchParams) as Record<string, string | undefined>;
  const where: Prisma.ActivityLogWhereInput = {
    ...(area && area in ACTIVITY_AREAS ? { area } : {}),
    ...(person ? { userId: person } : {}),
    ...(problems ? { action: { in: FAILED_SIGN_IN } } : {}),
    ...(before && !Number.isNaN(Date.parse(before)) ? { at: { lt: new Date(before) } } : {}),
  };
  const [rows, people, failedWeek] = await Promise.all([
    db.activityLog.findMany({ where, include: { user: { select: { name: true } } }, orderBy: { at: "desc" }, take: PAGE + 1 }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    recentFailedSignIns(),
  ]);
  const more = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);
  const query = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ area, person, problems, ...extra })) if (v) p.set(k, v);
    return `/admin/activity${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Activity log"
        subtitle="Sign-ins, logins and roles, settings, payroll, invoices and payments, exits and deletions. Only admins see this."
      />
      {failedWeek > 0 && !problems && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {failedWeek} failed {failedWeek === 1 ? "sign-in" : "sign-ins"} in the last 7 days.{" "}
          <Link href={query({ problems: "1", area: undefined, before: undefined })} className="font-medium underline">
            Show failed sign-ins
          </Link>
        </div>
      )}
      <form className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Kind">
          <select name="area" defaultValue={area ?? ""} className="input w-auto">
            <option value="">Everything</option>
            {Object.entries(ACTIVITY_AREAS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Done by">
          <select name="person" defaultValue={person ?? ""} className="input w-auto">
            <option value="">Anyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input type="checkbox" name="problems" value="1" defaultChecked={!!problems} /> Failed sign-ins only
        </label>
        <button className="btn-secondary">Show</button>
      </form>
      {shown.length === 0 ? (
        <Empty>Nothing logged yet{area || person || problems ? " for this filter" : ""}.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">What</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">From</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.id} className={FAILED_SIGN_IN.includes(r.action) ? "bg-red-50/40" : undefined}>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatDateTime(r.at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.user?.name ?? <span className="text-slate-400">Not signed in</span>}</td>
                  <td className="px-3 py-2">
                    <span className="mr-2">
                      <Badge color={areaColor[r.area as ActivityArea] ?? "gray"}>{ACTIVITY_AREAS[r.area as ActivityArea] ?? r.area}</Badge>
                    </span>
                    {r.summary}
                  </td>
                  <td className="hidden px-3 py-2 font-mono text-xs text-slate-500 md:table-cell">{r.ip ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && (
        <div className="mt-4">
          <Link href={query({ before: shown[shown.length - 1].at.toISOString() })} className="btn-secondary">
            Older
          </Link>
        </div>
      )}
    </>
  );
}
