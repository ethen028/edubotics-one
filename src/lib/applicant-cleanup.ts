/*
 * Deletes job applicants who were turned down or pulled out, once they have sat untouched for the
 * time set in Admin → Settings → Careers page (12 months unless changed; 0 keeps them). Keeping
 * people's resumes no longer than needed is what India's data protection law (DPDP Act) asks.
 * Hired candidates are never touched: their record links to the HR profile.
 *
 * No "server-only" import: the scheduler is started from src/instrumentation.ts.
 */
import { db } from "./db";

/** The moment before which a closed applicant's last change makes them due for deletion. */
export function applicantCutoff(now: Date, months: number) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** Deletes the applicants that are due and notes how many in the activity log. Returns the count. */
export async function deleteOldApplicants(now = new Date()) {
  const s = await db.companySettings.findUnique({ where: { id: 1 }, select: { applicantRetentionMonths: true } });
  const months = s?.applicantRetentionMonths ?? 12;
  if (months <= 0) return 0;
  const { count } = await db.candidate.deleteMany({
    where: { stage: { in: ["REJECTED", "WITHDRAWN"] }, employeeId: null, updatedAt: { lt: applicantCutoff(now, months) } },
  });
  if (count) {
    await db.activityLog
      .create({
        data: {
          area: "DELETED",
          action: "candidates.expired",
          summary: `Deleted ${count} rejected or withdrawn applicant${count === 1 ? "" : "s"} (with their files) not changed in ${months} months`,
        },
      })
      .catch(() => {});
  }
  return count;
}

/** Checks a few minutes after start and then every six hours. Started once, from src/instrumentation.ts. */
export function startApplicantCleanup() {
  const g = globalThis as unknown as { applicantCleanup?: NodeJS.Timeout };
  if (g.applicantCleanup) return;
  const safeRun = () => deleteOldApplicants().catch((e) => console.error("Applicant clean-up failed", e));
  setTimeout(safeRun, 3 * 60 * 1000).unref();
  g.applicantCleanup = setInterval(safeRun, 6 * 3600 * 1000);
  g.applicantCleanup.unref();
}
