import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { loadMeeting } from "@/lib/meetings";
import { requireTeamwork, teammateWhere } from "@/lib/teamwork";
import { PageHeader } from "@/components/ui";
import { updateMeeting } from "../../actions";
import { MeetingForm } from "../../form";

export const metadata = { title: "Change meeting" };

export default async function EditMeetingPage({ params }: PageProps<"/meetings/[id]/edit">) {
  const user = await requireTeamwork();
  const { id } = await params;
  const m = await loadMeeting(user.id, id);
  if (!m) notFound();
  if (m.organizerId !== user.id || m.cancelledAt) redirect(`/meetings/${id}`);
  const people = await db.user.findMany({ where: { ...(await teammateWhere()), id: { not: user.id } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Change meeting" subtitle="Everyone invited is told. A new time asks them again whether they can come." />
      <MeetingForm action={updateMeeting.bind(null, id)} people={people} submit="Save meeting" values={{ ...m, attendeeIds: m.attendees.map((a) => a.userId) }} />
    </>
  );
}
