/** Runs once when the server starts. Starts the daily backup check on the office computer and the applicant clean-up. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.BACKUP_DIR) {
    const { startBackupScheduler } = await import("./lib/backups");
    startBackupScheduler();
  }
  const { startApplicantCleanup } = await import("./lib/applicant-cleanup");
  startApplicantCleanup();
}
