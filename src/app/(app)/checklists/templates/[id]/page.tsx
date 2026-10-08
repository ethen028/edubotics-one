import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { scheduleLabel } from "@/lib/checklist-schedule";
import { canEditTemplate } from "@/lib/checklists";
import { saveTemplate, setTemplateActive } from "../../actions";
import { assignableUsers } from "../data";
import { TemplateForm } from "../template-form";

export const metadata = { title: "Checklist" };

export default async function TemplatePage({ params, searchParams }: PageProps<"/checklists/templates/[id]">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const { id } = await params;
  const { saved } = (await searchParams) as Record<string, string | undefined>;
  const t = await db.checklistTemplate.findUnique({
    where: { id },
    include: {
      items: { where: { archivedAt: null }, orderBy: { position: "asc" } },
      assignees: { select: { userId: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!t) notFound();
  const editable = canEditTemplate(user, t);
  const users = editable ? await assignableUsers() : [];

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={
          <>
            {scheduleLabel(t)} · set up by {t.createdBy.name} · counting from {formatDate(t.startsOn)}
            {t.endsOn && <> · switched off after {formatDate(t.endsOn)}</>}
          </>
        }
        actions={
          <>
            <Link href={`/checklists/history?checklist=${t.id}`} className="btn-secondary">
              History
            </Link>
            {editable && (
              <form action={setTemplateActive.bind(null, t.id)}>
                <input type="hidden" name="on" value={t.endsOn ? "1" : "0"} />
                <button className={t.endsOn ? "btn-primary" : "btn-secondary"}>{t.endsOn ? "Switch on again" : "Switch off"}</button>
              </form>
            )}
            <Link href="/checklists/templates" className="btn-secondary">
              All checklists
            </Link>
          </>
        }
      />
      {saved && (
        <div className="mb-4 max-w-3xl rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Saved. It shows up on Home and under Checklists for the people it&apos;s for.
        </div>
      )}
      {t.endsOn && (
        <div className="mb-4 max-w-3xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Switched off: nobody has to do it after {formatDate(t.endsOn)}. Its history stays. Switching it on again starts it fresh from
          that day.
        </div>
      )}
      <div className="max-w-3xl">
        {editable ? (
          <TemplateForm
            action={saveTemplate.bind(null, t.id)}
            users={users}
            defaults={{
              title: t.title,
              description: t.description ?? "",
              frequency: t.frequency,
              weekday: t.weekday ?? 6,
              dayOfMonth: t.dayOfMonth ?? 0,
              dueTime: t.dueTime ?? "",
              audience: t.audience,
              role: t.role ?? "EMPLOYEE",
              people: t.assignees.map((a) => a.userId),
              items: t.items.map((i) => ({ id: i.id, label: i.label, needsPhoto: i.needsPhoto })),
            }}
          />
        ) : (
          <section className="card">
            <p className="mb-3 text-sm text-slate-500">Only {t.createdBy.name} or an admin can change this checklist.</p>
            {t.description && <p className="mb-3 text-sm whitespace-pre-line">{t.description}</p>}
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {t.items.map((i) => (
                <li key={i.id}>
                  {i.label} {i.needsPhoto && <span className="text-xs text-amber-700">(photo)</span>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </>
  );
}
