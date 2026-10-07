import Link from "next/link";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { isAcked, myPendingAcks } from "@/lib/notices";
import { formatDate } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { PendingAcks } from "./ui";

export const metadata = { title: "Notice board" };

export default async function NoticesPage({ searchParams }: PageProps<"/notices">) {
  const user = await requireUser();
  const manager = isManagerOrAdmin(user);
  const { tab, archived } = (await searchParams) as Record<string, string | undefined>;
  const kind = tab === "policies" ? "POLICY" : "ANNOUNCEMENT";
  const showArchived = manager && archived === "1";

  const [notices, pending, activeUsers] = await Promise.all([
    db.notice.findMany({
      where: { kind, archivedAt: showArchived ? { not: null } : null },
      include: {
        author: { select: { name: true } },
        attachment: { select: { fileName: true } },
        acks: { where: { user: { active: true } }, select: { userId: true, version: true } },
      },
      orderBy: kind === "POLICY" ? [{ pinned: "desc" }, { category: "asc" }, { title: "asc" }] : [{ pinned: "desc" }, { createdAt: "desc" }],
    }),
    myPendingAcks(user),
    db.user.count({ where: { active: true } }),
  ]);

  const tabClass = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${on ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;
  const query = (t: string, a?: boolean) => `/notices?tab=${t}${a ? "&archived=1" : ""}`;
  const t = kind === "POLICY" ? "policies" : "announcements";

  return (
    <>
      <PageHeader
        title="Notice board"
        subtitle="Company announcements and policies"
        actions={
          manager && (
            <>
              <Link href="/notices/new?kind=ANNOUNCEMENT" className="btn-secondary">
                New announcement
              </Link>
              <Link href="/notices/new?kind=POLICY" className="btn-primary">
                New policy
              </Link>
            </>
          )
        }
      />

      <PendingAcks notices={pending} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={query("announcements")} className={tabClass(kind === "ANNOUNCEMENT" && !showArchived)}>
          Announcements
        </Link>
        <Link href={query("policies")} className={tabClass(kind === "POLICY" && !showArchived)}>
          Policies
        </Link>
        {manager && (
          <Link href={query(t, !showArchived)} className="link ml-auto text-sm">
            {showArchived ? "Back to current" : "Archived"}
          </Link>
        )}
      </div>

      {notices.length === 0 ? (
        <Empty>
          {showArchived
            ? "Nothing archived."
            : kind === "POLICY"
              ? "No policies posted yet."
              : "No announcements yet."}
          {manager && !showArchived && " Use the buttons above to post the first one."}
        </Empty>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => {
            const mine = n.acks.find((a) => a.userId === user.id);
            const ackCount = n.acks.filter((a) => isAcked(n, a)).length;
            return (
              <Link key={n.id} href={`/notices/${n.id}`} className="card block hover:border-brand-400">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.pinned && <Badge color="blue">Pinned</Badge>}
                      {n.category && <Badge>{n.category}</Badge>}
                      <h2 className="font-semibold text-slate-900">{n.title}</h2>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{n.body}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {n.author.name} · {formatDate(n.createdAt)}
                      {n.version > 1 && ` · updated ${formatDate(n.updatedAt)}`}
                      {n.attachment && ` · 📎 ${n.attachment.fileName}`}
                    </p>
                  </div>
                  {n.requiresAck && (
                    <div className="flex shrink-0 items-center gap-2 text-xs sm:flex-col sm:items-end sm:gap-1">
                      {isAcked(n, mine) ? <Badge color="green">You acknowledged</Badge> : <Badge color="amber">Please acknowledge</Badge>}
                      {manager && (
                        <span className="text-slate-500">
                          {ackCount} of {activeUsers} read
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
