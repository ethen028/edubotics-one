import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamwork } from "@/lib/teamwork";
import { loadMeeting, meetingWhen } from "@/lib/meetings";
import { callService, meetingStatus } from "@/lib/teamwork-rules";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/action-form";
import { Badge, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { cancelMeeting, respondToMeeting, saveMeetingNotes } from "../actions";
import { Avatar } from "../../messages/ui";

export const metadata = { title: "Meeting" };

const RESPONSE = { PENDING: "Not answered", YES: "Going", MAYBE: "Maybe", NO: "Not going" } as const;
const RESPONSE_COLOR = { PENDING: "gray", YES: "green", MAYBE: "amber", NO: "red" } as const;

/** One meeting: when and where, Join, who is coming, the agenda and the shared notes. */
export default async function MeetingPage({ params }: PageProps<"/meetings/[id]">) {
  const user = await requireTeamwork();
  const { id } = await params;
  const m = await loadMeeting(user.id, id);
  if (!m) notFound();
  const status = meetingStatus(m);
  const organiser = m.organizerId === user.id;
  const me = m.attendees.find((a) => a.userId === user.id);
  const service = m.joinUrl ? callService(m.joinUrl) : null;

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={`${meetingWhen(m)} · organised by ${organiser ? "you" : m.organizer.name}`}
        actions={
          <>
            {status !== "cancelled" && status !== "ended" && (
              <a href={`/meetings/${id}/invite.ics`} className="btn-secondary">
                <Icon name="calendar" className="h-4 w-4" />
                Add to my calendar
              </a>
            )}
            {organiser && status !== "cancelled" && (
              <Link href={`/meetings/${id}/edit`} className="btn-secondary">
                Change
              </Link>
            )}
          </>
        }
      />
      {status === "cancelled" && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">This meeting was cancelled.</div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {status !== "cancelled" && (
            <section className="card flex flex-wrap items-center gap-3">
              <span className="chat-avatar h-10 w-10">
                <Icon name="video" className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                {m.joinUrl ? (
                  <>
                    <div className="font-medium text-slate-900">
                      {status === "live" ? "On now" : status === "soon" ? "Starts soon" : status === "ended" ? "This meeting has ended" : `Call on ${service}`}
                    </div>
                    <div className="truncate text-xs text-slate-500">{m.joinUrl}</div>
                  </>
                ) : (
                  <div className="font-medium text-slate-900">No call link{m.location ? "" : " or place"} yet</div>
                )}
                {m.location && <div className="text-xs text-slate-500">Place: {m.location}</div>}
              </div>
              {m.joinUrl && status !== "ended" && (
                <a href={m.joinUrl} target="_blank" rel="noreferrer" className={status === "live" || status === "soon" ? "btn-primary" : "btn-secondary"}>
                  Join{service !== "the call" ? ` on ${service}` : ""}
                </a>
              )}
            </section>
          )}
          <section className="card">
            <h2 className="font-semibold">Agenda</h2>
            <p className="mt-2 text-sm whitespace-pre-wrap text-slate-700">{m.agenda || "No agenda yet."}</p>
          </section>
          <section className="card">
            <h2 className="font-semibold">Notes</h2>
            <p className="mt-1 text-xs text-slate-500">Anyone in the meeting can write here: decisions, who does what by when.</p>
            <ActionForm action={saveMeetingNotes.bind(null, id)} className="mt-3 space-y-2">
              <label htmlFor="meeting-notes" className="sr-only">
                Notes
              </label>
              <textarea id="meeting-notes" name="notes" rows={8} maxLength={10000} defaultValue={m.notes ?? ""} className="input" />
              <SubmitButton className="btn-secondary">Save notes</SubmitButton>
            </ActionForm>
          </section>
        </div>
        <div className="space-y-4 self-start">
          {me && status !== "cancelled" && status !== "ended" && (
            <section className="card">
              <h2 className="font-semibold">Can you come?</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["YES", "MAYBE", "NO"] as const).map((r) => (
                  <form key={r} action={respondToMeeting.bind(null, id, r)}>
                    <button className={me.response === r ? "btn-primary btn-sm" : "btn-secondary btn-sm"} aria-pressed={me.response === r}>
                      {r === "YES" ? "Yes" : r === "MAYBE" ? "Maybe" : "No"}
                    </button>
                  </form>
                ))}
              </div>
            </section>
          )}
          <section className="card">
            <h2 className="font-semibold">People ({m.attendees.length + 1})</h2>
            <ul className="mt-2 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Avatar name={m.organizer.name} size="sm" />
                <span className="flex-1">{organiser ? "You" : m.organizer.name}</span>
                <Badge color="purple">Organiser</Badge>
              </li>
              {m.attendees.map((a) => (
                <li key={a.userId} className="flex items-center gap-2">
                  <Avatar name={a.user.name} size="sm" />
                  <span className="flex-1">{a.userId === user.id ? "You" : a.user.name}</span>
                  <Badge color={RESPONSE_COLOR[a.response]}>{RESPONSE[a.response]}</Badge>
                </li>
              ))}
            </ul>
          </section>
          {organiser && status !== "cancelled" && status !== "ended" && (
            <form action={cancelMeeting.bind(null, id)}>
              <ConfirmButton className="btn-danger btn-sm" message={`Cancel "${m.title}"? Everyone invited is told.`}>
                Cancel meeting
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
