import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

// Meetings: only the organiser and the people invited can see a meeting, its agenda and its notes.

/** Meetings this person organises or is invited to. */
export const myMeetings = (userId: string): Prisma.MeetingWhereInput => ({
  OR: [{ organizerId: userId }, { attendees: { some: { userId } } }],
});

/** One meeting, only if this person organises it or is invited; otherwise null. */
export function loadMeeting(userId: string, id: string) {
  return db.meeting.findFirst({
    where: { id, ...myMeetings(userId) },
    include: {
      organizer: { select: { id: true, name: true, email: true } },
      attendees: { include: { user: { select: { id: true, name: true, active: true } } }, orderBy: { user: { name: "asc" } } },
    },
  });
}

/** This person's meetings that haven't finished yet, soonest first (for Home and the Meetings page). */
export function upcomingMeetings(userId: string, take = 50) {
  // Anything that started up to 3 hours ago may still be running; the page drops the ones that have ended.
  return db.meeting.findMany({
    where: { ...myMeetings(userId), cancelledAt: null, startsAt: { gte: new Date(Date.now() - 3 * 3600_000) } },
    orderBy: { startsAt: "asc" },
    take,
    include: {
      organizer: { select: { name: true } },
      attendees: { select: { userId: true, response: true } },
    },
  });
}

/** "Thu, 24 Oct, 3:30 pm – 4:00 pm" in Indian time. */
export function meetingWhen(m: { startsAt: Date; minutes: number }) {
  const end = new Date(m.startsAt.getTime() + m.minutes * 60_000);
  const day = m.startsAt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const t = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return `${day}, ${t(m.startsAt)} – ${t(end)}`;
}
