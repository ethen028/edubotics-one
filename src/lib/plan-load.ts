import type { Db } from "@/lib/db";
import { OPERATING_CALENDAR } from "@/lib/plan-rules";

/**
 * Puts the June 2026 – May 2027 operating calendar into the Annual plan. Months already there are left
 * as they are, so running it twice changes nothing. Returns how many months were added.
 * Takes the database client so the starter-data script (which runs outside Next.js) can use it too.
 */
export async function loadOperatingCalendar(db: Pick<Db, "planMonth">) {
  let added = 0;
  for (const m of OPERATING_CALENDAR) {
    const month = new Date(`${m.month}-01T00:00:00Z`);
    const exists = await db.planMonth.findFirst({ where: { month }, select: { id: true } });
    if (exists) continue;
    await db.planMonth.create({
      data: {
        month,
        focus: m.focus,
        activities: m.activities.join("\n"),
        targets: m.targets,
        leads: m.leads,
        review: m.review,
        reviewedAt: m.review ? new Date(`${m.month}-28T12:00:00Z`) : null,
        planningMeeting: new Date(`${m.planningMeeting}T04:30:00Z`), // 10:00 India time
        metrics: { create: m.metrics.map((x, i) => ({ kind: x.kind, label: x.label, target: x.target, sort: i })) },
      },
    });
    added++;
  }
  return added;
}
