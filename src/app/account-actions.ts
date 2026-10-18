"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { destroySession, getCurrentSession, hashPassword, verifyPassword } from "@/lib/auth";
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

export async function closeAccount(_: FormState, form: FormData): Promise<FormState> {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!(await allowRequest("close-account", current.user.id, 5, 900000))) return { error: "Too many attempts. Try again in 15 minutes." };
  if (form.get("confirm") !== "DELETE") return { error: "Type DELETE to confirm." };
  if (!(await verifyPassword(String(form.get("password") ?? ""), current.user.passwordHash))) return { error: "Your current password is incorrect." };
  const replacementHash = await hashPassword(randomBytes(32).toString("hex"));
  const now = new Date();
  const closed = await db.$transaction(async (tx) => {
    // Serialize administrative closures so two owners cannot both pass the last-owner check.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73261017)`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${current.user.id} FOR UPDATE`;
    const fresh = await tx.user.findUnique({ where: { id: current.user.id } });
    const liveSession = await tx.session.findFirst({ where: { id: current.session.id, userId: current.user.id, endedAt: null } });
    if (!fresh || !fresh.active || fresh.closedAt || !liveSession || fresh.passwordHash !== current.user.passwordHash) return "stale";
    if (fresh.role === "ADMIN" && await tx.user.count({ where: { role: "ADMIN", active: true, closedAt: null } }) <= 1) return "last-admin";
    await tx.user.update({ where: { id: current.user.id }, data: {
      active: false, closedAt: now, email: `closed-${current.user.id}@accounts.invalid`, name: "Closed account", googleSub: null,
      passwordHash: replacementHash, emailVerifiedAt: null,
    } });
    await tx.session.updateMany({ where: { userId: current.user.id, endedAt: null }, data: { endedAt: now } });
    await tx.accountToken.deleteMany({ where: { userId: current.user.id } });
    return "closed";
  }, { maxWait: 10000, timeout: 15000 });
  if (closed === "last-admin") return { error: "Create another active admin before closing the last admin account." };
  if (closed === "stale") return { error: "Your account or session changed. Sign in again before closing the account." };
  await logActivity({ id: current.user.id }, "LOGINS", "account.closed", "Account login closed and anonymized; linked business records retained for admin review");
  await destroySession();
  redirect("/login?closed=1");
}
