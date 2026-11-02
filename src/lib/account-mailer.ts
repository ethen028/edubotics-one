import "server-only";
import { rawDb as db } from "./db"; // recovery emails are for logins of every company
import { inCompany } from "./company";
import { seal, unseal } from "./secret-box";
import { trustedAppOrigin, tokenHash } from "./account-security";
import { issueAccountToken } from "./account-tokens";
import { getSettings } from "./settings";
import { mailSetup, sendEmail } from "./mail";
import { reportServerError } from "./telemetry";

export async function queueRecoveryEmail(email: string) {
  await db.accountMailJob.create({ data: { sealedEmail: seal(email), expiresAt: new Date(Date.now() + 15 * 60000) } });
}

/** The HTTP request never performs a user lookup or SMTP call, preventing account timing enumeration. */
export async function processRecoveryEmails() {
  const now = new Date();
  await db.accountMailJob.deleteMany({ where: { expiresAt: { lte: now } } });
  const stale = new Date(now.getTime() - 120000);
  const jobs = await db.accountMailJob.findMany({
    where: { expiresAt: { gt: now }, OR: [{ claimedAt: null }, { claimedAt: { lt: stale } }] },
    orderBy: { createdAt: "asc" }, take: 5,
  });
  for (const job of jobs) {
    const claimed = await db.accountMailJob.updateMany({ where: { id: job.id, OR: [{ claimedAt: null }, { claimedAt: { lt: stale } }] }, data: { claimedAt: now } });
    if (!claimed.count) continue;
    try {
      const email = unseal(job.sealedEmail);
      const user = email ? await db.user.findUnique({ where: { email } }) : null;
      if (user?.active && !user.closedAt) await inCompany(user.companyId, async () => {
        // Sent from the person's own company's mail account.
        const settings = await getSettings();
        const origin = trustedAppOrigin(process.env.APP_URL ?? settings.appAddress);
        if (!origin || mailSetup(settings) !== "READY") return;
        const raw = await issueAccountToken(user.id, "RESET_PASSWORD", user.email);
        const result = await sendEmail({ kind: "ACCOUNT_SECURITY", to: [user.email], subject: "Reset your Orbit password",
          message: `A password reset was requested for your account. This one-use link expires in 30 minutes:\n\n${origin}/reset-password?token=${raw}\n\nIf you did not request it, ignore this email.` }, settings, user.id);
        if ("error" in result) await db.accountToken.updateMany({ where: { tokenHash: tokenHash(raw) }, data: { usedAt: new Date() } });
        await db.activityLog.create({ data: { companyId: user.companyId, userId: user.id, area: "SIGN_IN", action: "password.reset-requested", summary: "An account recovery link was requested" } });
      });
    } catch (error) { reportServerError(error); }
    finally { await db.accountMailJob.deleteMany({ where: { id: job.id } }); }
  }
}

const runtime = globalThis as typeof globalThis & { recoveryMailer?: ReturnType<typeof setInterval> };
export function startRecoveryMailer() {
  if (runtime.recoveryMailer) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await processRecoveryEmails(); } catch (error) { reportServerError(error); }
    finally { busy = false; }
  };
  runtime.recoveryMailer = setInterval(() => { void tick(); }, 10000);
  runtime.recoveryMailer.unref();
}
