import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { humanize } from "@/lib/format";
import { scheduleLabel } from "@/lib/checklist-schedule";
import { canEditTemplate } from "@/lib/checklists";
import { ChecklistTabs } from "../ui";

export const metadata = { title: "Set up checklists" };

export default async function TemplatesPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const templates = await db.checklistTemplate.findMany({
    include: {
      createdBy: { select: { name: true } },
      assignees: { select: { user: { select: { name: true } } } },
      _count: { select: { items: { where: { archivedAt: null } } } },
    },
    orderBy: [{ endsOn: { sort: "desc", nulls: "first" } }, { title: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Checklists"
        subtitle="The routines people tick off, how often, and who does them."
        actions={
          <Link href="/checklists/templates/new" className="btn-primary">
            New checklist
          </Link>
        }
      />
      <ChecklistTabs current="setup" manager />
      {templates.length === 0 ? (
        <Empty>
          No checklists yet.{" "}
          <Link href="/checklists/templates/new" className="link">
            Start one
          </Link>{" "}
          from a ready-made list like office opening or the kit check before a school session.
        </Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Checklist</th>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Who</th>
                <th className="px-4 py-2 font-medium">Items</th>
                <th className="px-4 py-2 font-medium">Set up by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map((t) => (
                <tr key={t.id} className={t.endsOn ? "text-slate-400" : ""}>
                  <td className="px-4 py-2">
                    <Link href={`/checklists/templates/${t.id}`} className="font-medium hover:underline">
                      {t.title}
                    </Link>{" "}
                    {t.endsOn && <Badge>Switched off</Badge>}
                    {!canEditTemplate(user, t) && <span className="text-xs text-slate-400"> (view only)</span>}
                  </td>
                  <td className="px-4 py-2">{scheduleLabel(t)}</td>
                  <td className="px-4 py-2">
                    {t.frequency === "SESSION"
                      ? "Each session's trainer"
                      : t.audience === "EVERYONE"
                        ? "Everyone"
                        : t.audience === "ROLE"
                          ? `All ${humanize(t.role ?? "EMPLOYEE").toLowerCase()}s`
                          : t.assignees.map((a) => a.user.name.split(" ")[0]).join(", ") || "Nobody yet"}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{t._count.items}</td>
                  <td className="px-4 py-2 text-slate-500">{t.createdBy.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
