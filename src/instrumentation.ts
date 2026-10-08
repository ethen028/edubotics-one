/** Runs once when the server starts. Starts the daily backup check on the office computer. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.BACKUP_DIR) {
    const { startBackupScheduler } = await import("./lib/backups");
    startBackupScheduler();
  }
}
