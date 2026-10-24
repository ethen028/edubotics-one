"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { MeetingResponse } from "@prisma/client";
import { db } from "@/lib/db";
import type { FormState } from "@/components/action-form";
import { flash } from "@/lib/flash";
import { loadMeeting, meetingWhen } from "@/lib/meetings";
import { notify } from "@/lib/notifications";
import { parseISTDateTime } from "@/lib/recruitment";
import { requireTeamwork, teammatesAmong, teammateWhere } from "@/lib/teamwork";
import { MEETING_LENGTHS, checkJoinUrl } from "@/lib/teamwork-rules";

const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep the ${label} under ${max} characters.`)
    .transform((v) => v || null);

const meetingSchema = z.object({
  title: z.string().trim().min(2, "Give the meeting a short title.").max(120, "Keep the title under 120 characters."),
  startsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time.")
    .transform(parseISTDateTime),
  minutes: z.coerce.number().refine((n) => (MEETING_LENGTHS as readonly number[]).includes(n), "Pick how long it runs."),
  location: optional(120, "place"),
  agenda: optional(4000, "agenda"),
});

function refresh(id?: string) {
  revalidatePath("/meetings");
  if (id) revalidatePath(`/meetings/${id}`);
  revalidatePath("/calendar");
}

/** Reads the meeting form: details, the call link and who is invited (never the organiser themselves). */
async function readMeeting(formData: FormData, organizerId: string) {
  const parsed = meetingSchema.safeParse({
    title: formData.get("title") ?? "",
    startsAt: formData.get("startsAt") ?? "",
    minutes: formData.get("minutes") ?? "",
    location: formData.get("location") ?? "",
    agenda: formData.get("agenda") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const link = checkJoinUrl(String(formData.get("joinUrl") ?? ""));
  if ("error" in link) return { error: link.error };
  const people =
    formData.get("everyone") === "on"
      ? await db.user.findMany({ where: { ...(await teammateWhere()), id: { not: organizerId } }, select: { id: true, name: true } })
      : await teammatesAmong(formData.getAll("people").map(String), organizerId);
  if (people.length === 0) return { error: "Invite at least one person." };
  return { data: { ...parsed.data, joinUrl: link.url }, people };
}

export async function createMeeting(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeamwork();
  const read = await readMeeting(formData, user.id);
  if ("error" in read) return { error: read.error };
  if (read.data.startsAt.getTime() < Date.now() - 60 * 60_000) return { error: "That time has already passed. Pick a time from now on." };
  const m = await db.meeting.create({
    data: { ...read.data, organizerId: user.id, attendees: { create: read.people.map((p) => ({ userId: p.id })) } },
  });
  await notify(
    read.people.map((p) => p.id),
    user.id,
    { kind: "meeting.invited", title: `${user.name} invited you: ${m.title}`, body: meetingWhen(m), href: `/meetings/${m.id}` },
  );
  refresh();
  await flash("Meeting set up. Everyone invited has it in their Inbox.");
  redirect(`/meetings/${m.id}`);
}

export async function updateMeeting(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeamwork();
  const before = await loadMeeting(user.id, id);
  if (!before || before.organizerId !== user.id) return { error: "Only the person who set up this meeting can change it." };
  if (before.cancelledAt) return { error: "This meeting was cancelled." };
  const read = await readMeeting(formData, user.id);
  if ("error" in read) return { error: read.error };
  const keep = new Set(read.people.map((p) => p.id));
  const had = new Set(before.attendees.map((a) => a.userId));
  const moved = before.startsAt.getTime() !== read.data.startsAt.getTime() || before.minutes !== read.data.minutes;
  await db.$transaction([
    db.meetingAttendee.deleteMany({ where: { meetingId: id, userId: { notIn: [...keep] } } }),
    db.meetingAttendee.createMany({ data: read.people.filter((p) => !had.has(p.id)).map((p) => ({ meetingId: id, userId: p.id })) }),
    // A new time asks everyone again.
    ...(moved ? [db.meetingAttendee.updateMany({ where: { meetingId: id }, data: { response: "PENDING" } })] : []),
    db.meeting.update({ where: { id }, data: read.data }),
  ]);
  const when = meetingWhen(read.data);
  const added = read.people.filter((p) => !had.has(p.id)).map((p) => p.id);
  const stayed = read.people.filter((p) => had.has(p.id)).map((p) => p.id);
  await notify(added, user.id, { kind: "meeting.invited", title: `${user.name} invited you: ${read.data.title}`, body: when, href: `/meetings/${id}` });
  await notify(stayed, user.id, {
    kind: "meeting.changed",
    title: moved ? `New time for ${read.data.title}` : `${read.data.title} was updated`,
    body: when,
    href: `/meetings/${id}`,
  });
  refresh(id);
  await flash(moved ? "Meeting moved. Everyone was told and asked again if they can come." : "Meeting saved.");
  redirect(`/meetings/${id}`);
}

export async function cancelMeeting(id: string) {
  const user = await requireTeamwork();
  const m = await loadMeeting(user.id, id);
  if (!m || m.organizerId !== user.id) throw new Error("Only the person who set up this meeting can cancel it");
  if (m.cancelledAt) return;
  await db.meeting.update({ where: { id }, data: { cancelledAt: new Date() } });
  await notify(
    m.attendees.map((a) => a.userId),
    user.id,
    { kind: "meeting.cancelled", title: `Cancelled: ${m.title}`, body: meetingWhen(m), href: `/meetings/${id}` },
  );
  refresh(id);
  await flash("Meeting cancelled. Everyone invited was told.");
}

/** Yes, maybe or no from someone invited. */
export async function respondToMeeting(id: string, response: MeetingResponse) {
  const user = await requireTeamwork();
  if (!["YES", "MAYBE", "NO"].includes(response)) throw new Error("Pick yes, maybe or no");
  const m = await loadMeeting(user.id, id);
  if (!m || !m.attendees.some((a) => a.userId === user.id)) throw new Error("You are not invited to this meeting");
  await db.meetingAttendee.update({ where: { meetingId_userId: { meetingId: id, userId: user.id } }, data: { response } });
  refresh(id);
}

/** The meeting notes. Anyone in the meeting can write them, during or after. */
export async function saveMeetingNotes(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeamwork();
  const m = await loadMeeting(user.id, id);
  if (!m) return { error: "Meeting not found." };
  const notes = optional(10000, "notes").safeParse(formData.get("notes") ?? "");
  if (!notes.success) return { error: notes.error.issues[0].message };
  await db.meeting.update({ where: { id }, data: { notes: notes.data } });
  refresh(id);
  return { ok: "Notes saved." };
}
