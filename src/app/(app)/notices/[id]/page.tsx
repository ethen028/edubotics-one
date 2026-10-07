import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { ackRoster, canEditNotice, isAcked } from "@/lib/notices";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { Badge, PageHeader } from "@/components/ui";
import { acknowledgeNotice, toggleArchived, togglePinned } from "../actions";

export const metadata = { title: "Notice" };

export default async function NoticePage({ params }: PageProps<"/notices/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const notice = await db.notice.findUnique({
    where: { id },
    include: {
      author: { select: { name: true } },
      attachment: { select: { fileName: true, mimeType: true, size: true } },
      acks: { where: { userId: user.id } },
    },
  });
  if (!notice) notFound();
  const manager = isManagerOrAdmin(user);
  const editable = canEditNotice(user, notice);
  const mine = notice.acks[0];
  const acked = isAcked(notice, mine);
  const roster = manager && notice.requiresAck ? await ackRoster(notice) : null;
  const overdue = notice.ackDueDate && notice.ackDueDate < todayIST();
  const fileUrl = `/api/notices/${notice.id}/file`;

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href={`/notices?tab=${notice.kind === "POLICY" ? "policies" : "announcements"}`} className="link">
          ← Notice board
        </Link>
      </div>
      <PageHeader
        title={notice.title}
        subtitle={
          <>
            {humanize(notice.kind)}
            {notice.category && ` · ${notice.category}`} · posted by {notice.author.name} on {formatDate(notice.createdAt)}
            {notice.version > 1 && ` · version ${notice.version}, ${formatDate(notice.updatedAt)}`}
          </>
        }
        actions={
          editable && (
            <>
              <Link href={`/notices/${notice.id}/edit`} className="btn-secondary">
                Edit
              </Link>
              <form action={togglePinned.bind(null, notice.id)}>
                <button className="btn-secondary">{notice.pinned ? "Unpin" : "Pin"}</button>
              </form>
              <form action={toggleArchived.bind(null, notice.id)}>
                <button className="btn-secondary">{notice.archivedAt ? "Restore" : "Archive"}</button>
              </form>
            </>
          )
        }
      />

      {notice.archivedAt && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Archived on {formatDate(notice.archivedAt)}. It no longer shows on Home or asks for acknowledgement.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <article className="card">
            <div className="text-sm leading-relaxed whitespace-pre-line text-slate-800">{notice.body}</div>
            {notice.attachment && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                {notice.attachment.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl} alt={notice.attachment.fileName} className="max-h-[32rem] rounded-lg border border-slate-200" />
                ) : null}
                <a href={fileUrl} target="_blank" rel="noopener" className="btn-secondary mt-3">
                  📎 Open {notice.attachment.fileName} ({Math.ceil(notice.attachment.size / 1024)} KB)
                </a>
              </div>
            )}
          </article>

          {notice.requiresAck && !notice.archivedAt && (
            <section className={`card ${acked ? "" : "border-amber-300 bg-amber-50"}`}>
              {acked ? (
                <p className="text-sm text-emerald-800">
                  ✓ You acknowledged this on {formatDateTime(mine!.ackedAt)}.
                </p>
              ) : (
                <form action={acknowledgeNotice.bind(null, notice.id)} className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-amber-900">
                    {mine ? "This was updated since you last read it. " : ""}
                    Please read it{notice.attachment ? " and the attached document" : ""}, then confirm.
                    {notice.ackDueDate && (
                      <span className={overdue ? " font-semibold text-red-700" : ""}> Due {formatDate(notice.ackDueDate)}.</span>
                    )}
                  </p>
                  <button className="btn-primary">I have read this</button>
                </form>
              )}
            </section>
          )}
        </div>

        {roster && (
          <section className="card text-sm">
            <h2 className="mb-1 font-semibold">Acknowledgements</h2>
            <p className="mb-3 text-slate-500">
              {roster.done.length} of {roster.total} people
              {notice.ackDueDate && ` · due ${formatDate(notice.ackDueDate)}`}
            </p>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-brand-500" style={{ width: `${roster.total ? (roster.done.length / roster.total) * 100 : 0}%` }} />
            </div>
            <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Not yet ({roster.waiting.length})
            </h3>
            {roster.waiting.length === 0 ? (
              <p className="text-emerald-700">Everyone has read it.</p>
            ) : (
              <ul className="space-y-1">
                {roster.waiting.map((u) => (
                  <li key={u.id} className="flex justify-between gap-2">
                    <span>{u.name}</span>
                    {u.olderVersion ? <Badge color="amber">Read old version</Badge> : overdue ? <Badge color="red">Overdue</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Acknowledged ({roster.done.length})
            </h3>
            <ul className="space-y-1">
              {roster.done.map((u) => (
                <li key={u.id} className="flex justify-between gap-2">
                  <span>{u.name}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(u.ackedAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
