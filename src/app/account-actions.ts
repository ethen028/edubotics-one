"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, hashPassword } from "@/lib/auth";
import { trustedAppOrigin, tokenHash } from "@/lib/account-security";
import { issueAccountToken, consumeAccountToken } from "@/lib/account-tokens";
import { passwordProblem } from "@/lib/passwords";
import { allowRequest } from "@/lib/rate-limit";
import { logActivity, requestIp } from "@/lib/activity";
import { verifyCaptcha } from "@/lib/captcha";
import { getSettings } from "@/lib/settings";
import { mailSetup, sendEmail } from "@/lib/mail";
import { processRecoveryEmails, queueRecoveryEmail } from "@/lib/account-mailer";
import { reportServerError } from "@/lib/telemetry";
import type { FormState } from "@/components/action-form";

const REQUESTED = "If that address has an active account and email is configured, a recovery link will arrive shortly. You can also ask your admin for help.";
const BAD_LINK = "This link is invalid, expired, or already used. Request a new link.";

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.email().max(254).safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { error: "Enter a valid work email address." };
  if (!(await allowRequest("recovery-ip", await requestIp() ?? "unknown", 10, 900000)) ||
      !(await allowRequest("recovery-email", parsed.data, 3, 3600000))) return { ok: REQUESTED };
  if (!(await verifyCaptcha(form.get("cf-turnstile-response"), "account-recovery"))) return { error: "Complete the spam-protection check, then try again." };
  if (!(await allowRequest("recovery-global", "all", 60, 3600000))) return { ok: REQUESTED };
  await queueRecoveryEmail(parsed.data);
  if (process.env.VERCEL === "1") after(async () => {
    try { await processRecoveryEmails(); } catch (error) { reportServerError(error); }
  });
  return { ok: REQUESTED };
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  if (!(await allowRequest("reset-submit", await requestIp() ?? "unknown", 20, 900000))) return { error: "Too many attempts. Try again in 15 minutes." };
  const raw = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{64}$/.test(raw)) return { error: BAD_LINK };
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "The passwords do not match." };
  const token = await db.accountToken.findUnique({ where: { tokenHash: tokenHash(raw) }, include: { user: true } });
  if (!token) return { error: BAD_LINK };
  const problem = passwordProblem(password, token.user);
  if (problem) return { error: problem };
  const userId = await consumeAccountToken(raw, "RESET_PASSWORD", await hashPassword(password));
  if (!userId) return { error: BAD_LINK };
  await logActivity({ id: userId }, "LOGINS", "password.reset", "Password reset through a one-use email link; all sessions ended");
  redirect("/login?reset=1");
}

export async function requestEmailVerification(): Promise<FormState> {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (current.user.emailVerifiedAt) return { ok: "Your email is already verified." };
  if (!(await allowRequest("verify-email", current.user.id, 3, 3600000))) return { error: "Try again in an hour." };
  const settings = await getSettings();
  const origin = trustedAppOrigin(process.env.APP_URL ?? settings.appAddress);
  if (!origin || mailSetup(settings) !== "READY") return { error: "An admin must configure the app address and test the mail account first." };
  let raw: string;
  try { raw = await issueAccountToken(current.user.id, "VERIFY_EMAIL", current.user.email); }
  catch { return { error: "Your account changed. Reload this page and try again." }; }
  const result = await sendEmail({ kind: "ACCOUNT_SECURITY", to: [current.user.email], subject: "Verify your Edubotics One email",
    message: `Verify your work email with this one-use link. It expires in one hour:\n\n${origin}/verify-email?token=${raw}\n\nIf you did not request this, ignore this email.` }, settings, current.user.id);
  if ("error" in result) {
    await db.accountToken.updateMany({ where: { tokenHash: tokenHash(raw) }, data: { usedAt: new Date() } });
    return { error: "The verification email could not be sent. Ask an admin to check the mail account." };
  }
  return { ok: "Verification email sent. Check your inbox." };
}

export async function verifyEmail(_: FormState, form: FormData): Promise<FormState> {
  if (!(await allowRequest("verify-submit", await requestIp() ?? "unknown", 20, 900000))) return { error: "Too many attempts. Try again in 15 minutes." };
  const userId = await consumeAccountToken(String(form.get("token") ?? ""), "VERIFY_EMAIL");
  if (!userId) return { error: BAD_LINK };
  await logActivity({ id: userId }, "LOGINS", "email.verified", "Work email verified through a one-use link");
  return { ok: "Email verified. You can return to your workspace." };
}
