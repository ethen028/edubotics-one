import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { canSeeUser, checklistEntries } from "@/lib/checklists";
import { tickItem, untickItem } from "../../../actions";
import { ChecklistStatusBadge, Progress, slotWhen } from "../../../ui";
import { TickForm } from "./tick-form";

export const metadata = { title: "Checklist" };

export default async function ChecklistRunPage({ params, searchParams }: PageProps<"/checklists/run/[templateId]/[key]">) {
  const viewer = await requireUser();
  const { templateId, key } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const userId = sp.user ?? viewer.id;
  if (!(await canSeeUser(viewer, userId))) notFound();

  let date: Date;
  if (key.startsWith("session-")) {
    const session = await db.programmeSession.findUnique({ where: { id: key.slice(8) }, select: { date: true } });
    if (!session) notFound();
    date = session.date;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    date = new Date(`${key}T00:00:00.000Z`);
  } else {
    notFound();
  }
  const entry = (await checklistEntries({ userIds: [userId], from: date, to: date, templateId })).find((e) => e.slot.periodKey === key);
  if (!entry) notFound();

  const [template, ticks] = await Promise.all([
    db.checklistTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: { items: { orderBy: { position: "asc" } }, createdBy: { select: { name: true } } },
    }),
    entry.run
      ? db.checklistTick.findMany({
          where: { runId: entry.run.id },
          select: {
            itemId: true,
            note: true,
            tickedAt: true,
            tickedBy: { select: { name: true } },
            photo: { select: { id: true, fileName: true } },
          },
        })
      : [],
  ]);
  const tickOf = new Map(ticks.map((t) => [t.itemId, t]));
  // Removed items still show when they were ticked here, so the record reads as it was.
  const items = template.items.filter((i) => !i.archivedAt || tickOf.has(i.id));
  const active = template.items.filter((i) => !i.archivedAt);
  const tickedNow = active.filter((i) => tickOf.has(i.id)).length;
  const now = new Date();
  const mine = userId === viewer.id;
  const editable = mine && entry.status !== "MISSED" && entry.status !== "UPCOMING" && entry.slot.closesAt > now;
  const today = todayIST();

  return (
    <>
      <PageHeader
        title={template.title}
        subtitle={
          <>
            {!mine && <b>{entry.user.name} · </b>}
            {slotWhen(entry, today)}
          </>
        }
        actions={
          <>
            {entry.session && (
              <Link href={`/operations/sessions/${entry.session.id}`} className="btn-secondary">
                Session
              </Link>
            )}
            <Link href={mine ? "/checklists" : "/checklists/team"} className="btn-secondary">
              Back
            </Link>
          </>
        }
      />

      <div className="max-w-2xl">
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ChecklistStatusBadge status={entry.status} />
            <Progress done={tickedNow} total={active.length} />
          </div>
          <div className="text-xs text-slate-500">
            {entry.run?.completedAt
              ? `Finished ${formatDateTime(entry.run.completedAt)}`
              : entry.status === "MISSED"
                ? `Closed ${formatDateTime(entry.slot.closesAt)}`
                : `Due ${formatDateTime(entry.slot.dueAt)}`}
          </div>
        </div>

        {template.description && <p className="mb-4 text-sm whitespace-pre-line text-slate-600">{template.description}</p>}
        {!mine && <p className="mb-3 text-sm text-slate-500">You&apos;re viewing {entry.user.name.split(" ")[0]}&apos;s checklist.</p>}
        {entry.status === "MISSED" && mine && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            This checklist closed before it was finished, so it shows as missed to your manager.
          </div>
        )}

        <ul className="space-y-2">
          {items.map((item) => {
            const tick = tickOf.get(item.id);
            return (
              <li key={item.id} className={`card p-3 ${tick ? "border-emerald-200 bg-emerald-50/40" : ""}`}>
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm ${
                      tick ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"
                    }`}
                    aria-hidden
                  >
                    {tick ? "✓" : ""}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium ${item.archivedAt ? "text-slate-400 line-through" : ""}`}>{item.label}</div>
                    {item.needsPhoto && !tick && <div className="text-xs text-amber-700">Needs a photo</div>}
                    {tick && (
                      <div className="mt-0.5 text-xs text-slate-500">
                        {tick.tickedBy.name} · {formatDateTime(tick.tickedAt)}
                      </div>
                    )}
                    {tick?.note && <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{tick.note}</p>}
                    {tick?.photo && (
                      <a href={`/api/checklists/photos/${tick.photo.id}`} target="_blank" rel="noopener" className="mt-2 inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element -- streamed from our own API, not a static asset */}
                        <img
                          src={`/api/checklists/photos/${tick.photo.id}`}
                          alt={`Photo for ${item.label}`}
                          className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                        />
                      </a>
                    )}
                  </div>
                  {editable && tick && !item.archivedAt && (
                    <form action={untickItem.bind(null, templateId, key, item.id)}>
                      <button className="text-xs text-slate-500 hover:text-red-600">Undo</button>
                    </form>
                  )}
                </div>
                {editable && !item.archivedAt && (
                  <TickForm
                    // Remount after each save so the form closes again.
                    key={`${!!tick}|${tick?.photo?.id}|${tick?.note}`}
                    action={tickItem.bind(null, templateId, key, item.id)}
                    ticked={!!tick}
                    needsPhoto={item.needsPhoto}
                    hasPhoto={!!tick?.photo}
                  />
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-xs text-slate-400">Set up by {template.createdBy.name}.</p>
      </div>
    </>
  );
}
