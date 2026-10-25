"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rawDb } from "@/lib/db"; // sign-in and your own login work across the whole group
import { firstCompanyId } from "@/lib/company";
import {
  createSession,
  destroySession,
  endSessions,
  getCurrentSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { logActivity, requestIp } from "@/lib/activity";
import { passwordProblem } from "@/lib/passwords";
import { emailLock, ipBlocked, minutesUntil, recordAttempt } from "@/lib/sign-in";
import type { FormState } from "@/components/action-form";
import { allowRequest } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  password: z.string().min(1).max(200),
});

// Compared against when the email has no login, so a wrong email takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password } = parsed.data;
  const ip = await requestIp();
  if (!(await allowRequest("login", ip ?? "unknown", 30, 900000))) return { error: "Too many sign-in attempts. Try again in 15 minutes." };
  const user = await rawDb.user.findUnique({ where: { email } });
  const rules = (await rawDb.companySettings.findUnique({ where: { companyId: user?.companyId ?? (await firstCompanyId()) } })) ?? { loginMaxAttempts: 5, loginLockMinutes: 15 };

  if (await ipBlocked(ip)) return { error: "Too many wrong sign-ins from this device. Wait 15 minutes and try again." };
  const lock = await emailLock(email, rules);
  if (lock.lockedUntil) {
    return {
      error: `This account is locked after ${rules.loginMaxAttempts} wrong passwords. Try again in ${minutesUntil(lock.lockedUntil)} minutes, or ask an admin to unlock it.`,
    };
  }

  dummyHash ??= hashPassword("not-a-real-password-1");
  const matches = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !user.active || user.closedAt || !matches) {
    await recordAttempt(email, ip, false);
    const left = lock.left - 1;
    if (left <= 0) {
      await logActivity(user, "SIGN_IN", "sign-in.locked", `${email} locked for ${rules.loginLockMinutes} minutes after ${rules.loginMaxAttempts} wrong passwords`);
      return { error: `Too many wrong passwords. This account is locked for ${rules.loginLockMinutes} minutes, or until an admin unlocks it.` };
    }
    await logActivity(user, "SIGN_IN", "sign-in.failed", user && !user.active && matches ? `${email} tried to sign in but the login is switched off` : `Wrong password for ${email}`);
    return {
      error: left <= 2 ? `Email or password is incorrect. ${left} ${left === 1 ? "try" : "tries"} left before the account is locked.` : "Email or password is incorrect.",
    };
  }

  // Passwords set before the rules existed (or the starting admin password) are replaced now.
  if (!user.mustChangePassword && passwordProblem(password, user)) {
    await rawDb.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { mustChangePassword: true } });
  }
  if (!(await createSession(user.id, "PASSWORD", user.passwordHash))) {
    await recordAttempt(email, ip, false);
    return { error: "Email or password is incorrect." };
  }
  await recordAttempt(email, ip, true);
  await logActivity(user, "SIGN_IN", "sign-in", `${user.name} signed in with a password`);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/** Sets a new password: the forced change after a temporary password, or from My account. */
export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const { user, session } = current;
  if (!(await allowRequest("password-change", user.id, 5, 900000))) return { error: "Too many attempts. Try again in 15 minutes." };
  const now = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  if (next !== String(formData.get("confirm") ?? "")) return { error: "The two new passwords don't match." };
  if (!(await verifyPassword(now, user.passwordHash))) return { error: "Your current password is incorrect." };
  if (now === next) return { error: "Pick a password different from the current one." };
  const problem = passwordProblem(next, user);
  if (problem) return { error: problem };
  const passwordHash = await hashPassword(next);
  const ended = await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    const activeSession = await tx.session.findFirst({ where: { id: session.id, userId: user.id, endedAt: null } });
    if (!activeSession) return null;
    const changed = await tx.user.updateMany({
      where: { id: user.id, active: true, closedAt: null, passwordHash: user.passwordHash },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
    if (changed.count !== 1) return null;
    const revoked = await tx.session.updateMany({ where: { userId: user.id, id: { not: session.id }, endedAt: null }, data: { endedAt: new Date() } });
    await tx.accountToken.updateMany({ where: { userId: user.id, kind: "RESET_PASSWORD", usedAt: null }, data: { usedAt: new Date() } });
    return revoked.count;
  });
  if (ended === null) return { error: "Your account changed during this request. Sign in again and retry." };
  await logActivity(user, "LOGINS", "password.changed", `${user.name} changed their password${ended ? ` (signed out ${ended} other ${ended === 1 ? "device" : "devices"})` : ""}`);
  if (formData.get("then") === "home") redirect("/");
  revalidatePath("/account");
  return { ok: ended ? `Password changed. ${ended} other ${ended === 1 ? "device was" : "devices were"} signed out.` : "Password changed." };
}

/** Light, dark, or follow the device: saved on the person, so it applies on every device they use. */
export async function setAppearance(formData: FormData) {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const theme = z.enum(["LIGHT", "DARK", "SYSTEM"]).safeParse(formData.get("theme"));
  if (!theme.success) return;
  await rawDb.user.update({ where: { id: current.user.id }, data: { theme: theme.data } });
  revalidatePath("/", "layout");
}

/** Remembers whether this person keeps the side menu shrunk to icons. No page refresh: the menu already moved. */
export async function setMenuCollapsed(collapsed: boolean) {
  const current = await getCurrentSession();
  if (!current) return;
  await rawDb.user.update({ where: { id: current.user.id }, data: { menuCollapsed: collapsed === true } });
}

/** Signs out every other browser this person is signed in on. */
export async function signOutOtherDevices() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const ended = await endSessions(current.user.id, current.session.id);
  if (ended) await logActivity(current.user, "SIGN_IN", "sign-out.others", `${current.user.name} signed out ${ended} other ${ended === 1 ? "device" : "devices"}`);
  revalidatePath("/account");
}
