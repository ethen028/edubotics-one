import Link from "next/link";
import { db } from "@/lib/db";
import { requireTeamwork } from "@/lib/teamwork";
import { meetingWhen, myMeetings, upcomingMeetings } from "@/lib/meetings";
import { meetingStatus } from "@/lib/teamwork-rules";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Meetings" };

const RESPONSE = { PENDING: "Not answered", YES: "Going", MAYBE: "Maybe", NO: "Not going" } as const;

/** Your meetings: the ones coming up (with Join when it's time) and the last month's, for their notes. */
export default async function MeetingsPage() {
  const user = await requireTeamwork();
  const now = new Date();
  const [upcoming, past] = await Promise.all([
    upcomingMeetings(user.id),
    db.meeting.findMany({
      where: { ...myMeetings(user.id), startsAt: { lt: now, gte: new Date(now.getTime() - 30 * 86400_000) } },
      orderBy: { startsAt: "desc" },
      take: 30,
      select: { id: true, title: true, startsAt: true, minutes: true, cancelledAt: true, notes: true },
    }),
  ]);
  const coming = upcoming.filter((m) => meetingStatus(m, now) !== "ended");
  const ended = past.filter((m) => meetingStatus(m, now) === "ended" || m.cancelledAt);

  return (
    <>
      <PageHeader
        title="Meetings"
        subtitle="Set up a meeting, share the agenda and keep the notes in one place. The call runs in Google Meet, Zoom or Teams."
        actions={
          <Link href="/meetings/new" className="btn-primary">
            <Icon name="plus" className="h-4 w-4" />
            New meeting
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <section className="card">
          <h2 className="font-semibold">Coming up</h2>
          {coming.length === 0 ? (
            <div className="mt-3">
              <Empty>No meetings coming up. Set one up and invite people; it shows on their Calendar.</Empty>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {coming.map((m) => {
                const status = meetingStatus(m, now);
                const mine = m.attendees.find((a) => a.userId === user.id);
                const going = m.attendees.filter((a) => a.response === "YES").length;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="chat-avatar h-10 w-10">
                      <Icon name="video" className="h-4 w-4" />
                    </span>
                    <Link href={`/meetings/${m.id}`} className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900 hover:underline">{m.title}</span>
                      <span className="block text-xs text-slate-500">
                        {meetingWhen(m)} · {m.organizerId === user.id ? "You organise" : m.organizer.name} · {going + 1} going
                      </span>
                    </Link>
                    {status === "live" && <Badge color="green">On now</Badge>}
                    {status === "soon" && <Badge color="amber">Starts soon</Badge>}
                    {mine && <Badge color={mine.response === "PENDING" ? "amber" : "gray"}>{RESPONSE[mine.response]}</Badge>}
                    {m.joinUrl && (status === "live" || status === "soon") && (
                      <a href={m.joinUrl} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
                        Join
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="card self-start">
          <h2 className="font-semibold">Last 30 days</h2>
          {ended.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No meetings in the last 30 days.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {ended.map((m) => (
                <li key={m.id}>
                  <Link href={`/meetings/${m.id}`} className="block py-2.5 hover:bg-slate-50">
                    <span className={`block truncate text-sm font-medium ${m.cancelledAt ? "text-slate-400 line-through" : "text-slate-900"}`}>{m.title}</span>
                    <span className="block text-xs text-slate-500">
                      {meetingWhen(m)}
                      {m.cancelledAt ? " · Cancelled" : m.notes ? " · Has notes" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
