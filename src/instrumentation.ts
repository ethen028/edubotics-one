/**
 * Runs once when the server starts. Starts the daily backup check on the office computer, the account email sender,
 * the automatic payment reminders (on Vercel the cron in vercel.json does that) and the applicant clean-up.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL !== "1") {
    const { startRecoveryMailer } = await import("./lib/account-mailer");
    startRecoveryMailer();
    const { startReminderScheduler } = await import("./lib/payment-reminders");
    startReminderScheduler();
    if (process.env.BACKUP_DIR) {
      const { startBackupScheduler } = await import("./lib/backups");
      startBackupScheduler();
    }
  }
  const { startApplicantCleanup } = await import("./lib/applicant-cleanup");
  startApplicantCleanup();
}

export const onRequestError: import("next").Instrumentation.onRequestError = async (error, request) => {
  const { reportServerError } = await import("./lib/telemetry");
  reportServerError(error, { path: request.path });
};
