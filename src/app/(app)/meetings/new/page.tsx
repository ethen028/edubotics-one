import Link from "next/link";
import { db } from "@/lib/db";
import { requireTeamwork, teammateWhere } from "@/lib/teamwork";
import { PageHeader } from "@/components/ui";
import { createMeeting } from "../actions";
import { MeetingForm } from "../form";

export const metadata = { title: "New meeting" };

export default async function NewMeetingPage({ searchParams }: PageProps<"/meetings/new">) {
  const user = await requireTeamwork();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const people = await db.user.findMany({ where: { ...(await teammateWhere()), id: { not: user.id } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader
        title="New meeting"
        subtitle="Only the people you invite can see the meeting, its agenda and notes."
        actions={
          <Link href="/meetings" className="btn-secondary">
            Back to meetings
          </Link>
        }
      />
      <MeetingForm
        action={createMeeting}
        people={people}
        draft="new-meeting"
        submit="Set up meeting"
        values={{ title: "", startsAt: null, minutes: 30, location: null, joinUrl: null, agenda: null, attendeeIds: sp.with ? [sp.with] : [] }}
      />
    </>
  );
}
