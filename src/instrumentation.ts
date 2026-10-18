/** Runs once when the server starts. Starts the daily backup check on the office computer. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.VERCEL !== "1") {
    const { startRecoveryMailer } = await import("./lib/account-mailer");
    startRecoveryMailer();
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.VERCEL !== "1" && process.env.BACKUP_DIR) {
    const { startBackupScheduler } = await import("./lib/backups");
    startBackupScheduler();
  }
}

export const onRequestError: import("next").Instrumentation.onRequestError = async (error, request) => {
  const { reportServerError } = await import("./lib/telemetry");
  reportServerError(error, { path: request.path });
};
