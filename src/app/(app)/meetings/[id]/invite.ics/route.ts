import { calendarInvite } from "@/lib/ics";
import { loadMeeting } from "@/lib/meetings";
import { getTeamworkApiUser } from "@/lib/teamwork";

/** The meeting as a calendar file, to add it to a phone or Google calendar. */
export async function GET(_: Request, { params }: RouteContext<"/meetings/[id]/invite.ics">) {
  const access = await getTeamworkApiUser();
  if (access.error) return access.error;
  const { id } = await params;
  const m = await loadMeeting(access.user.id, id);
  if (!m || m.cancelledAt) return new Response("Not found", { status: 404 });
  const ics = calendarInvite({
    uid: `meeting-${m.id}@orbit`,
    start: m.startsAt,
    minutes: m.minutes,
    title: m.title,
    description: [m.joinUrl && `Join: ${m.joinUrl}`, m.agenda].filter(Boolean).join("\n\n"),
    location: m.joinUrl ?? m.location,
    organizer: { name: m.organizer.name, email: m.organizer.email },
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="meeting.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
