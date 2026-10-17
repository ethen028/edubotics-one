import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { daysFromNow } from "@/lib/time";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/notifications";
import { markAllRead, openNotification, toggleRead } from "./actions";

export const metadata = { title: "Inbox" };

const kindColor: Partial<Record<NotificationKind, "gray" | "blue" | "green" | "amber" | "red" | "purple">> = {
  "task.assigned": "blue",
  "task.update-requested": "amber",
  "task.review": "purple",
  "task.blocked": "red",
  "task.unblocked": "green",
  "project.decided": "green",
  "timesheet.decided": "green",
};

/** Task Flow v5's Inbox: tasks given to you, updates asked for, posts on your projects and decisions on your requests. */
export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const unreadOnly = sp.show === "unread";

  // Read messages are kept for 90 days.
  await db.notification.deleteMany({ where: { userId: user.id, readAt: { lt: daysFromNow(-90) } } });
  const [messages, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={unread ? `${unread} unread` : "All caught up"}
        actions={
          <>
            <Link href={unreadOnly ? "/inbox" : "?show=unread"} className="btn-secondary">
              {unreadOnly ? "Show all" : "Unread only"}
            </Link>
            {unread > 0 && (
              <form action={markAllRead}>
                <button className="btn-secondary">Mark all read</button>
              </form>
            )}
          </>
        }
      />
      {messages.length === 0 ? (
        <Empty>
          {unreadOnly
            ? "Nothing unread."
            : "Nothing here yet. Tasks given to you, update requests, posts on your projects and timesheet decisions show up here."}
        </Empty>
      ) : (
        <ul className="card divide-y divide-slate-100 p-0">
          {messages.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.readAt ? "" : "bg-brand-50/60"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-600"}`} />
              <form action={openNotification.bind(null, n.id)} className="min-w-0 flex-1">
                <button className="block w-full text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={kindColor[n.kind as NotificationKind] ?? "gray"}>
                      {NOTIFICATION_KINDS[n.kind as NotificationKind] ?? n.kind}
                    </Badge>
                    <span className={`text-sm ${n.readAt ? "text-slate-700" : "font-semibold text-slate-900"} hover:underline`}>
                      {n.title}
                    </span>
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{n.body}</p>}
                  <div className="mt-0.5 text-xs text-slate-400">{formatDateTime(n.createdAt)}</div>
                </button>
              </form>
              <form action={toggleRead.bind(null, n.id)}>
                <button className="text-xs whitespace-nowrap text-slate-400 hover:text-brand-700">
                  {n.readAt ? "Mark unread" : "Mark read"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
