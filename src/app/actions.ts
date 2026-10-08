"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
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

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// Compared against when the email has no login, so a wrong email takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password } = parsed.data;
  const ip = await requestIp();
  const rules = (await db.companySettings.findUnique({ where: { id: 1 } })) ?? { loginMaxAttempts: 5, loginLockMinutes: 15 };

  if (await ipBlocked(ip)) return { error: "Too many wrong sign-ins from this device. Wait 15 minutes and try again." };
  const lock = await emailLock(email, rules);
  if (lock.lockedUntil) {
    return {
      error: `This account is locked after ${rules.loginMaxAttempts} wrong passwords. Try again in ${minutesUntil(lock.lockedUntil)} minutes, or ask an admin to unlock it.`,
    };
  }

  const user = await db.user.findUnique({ where: { email } });
  dummyHash ??= hashPassword("not-a-real-password-1");
  const matches = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !user.active || !matches) {
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

  await recordAttempt(email, ip, true);
  // Passwords set before the rules existed (or the starting admin password) are replaced now.
  if (!user.mustChangePassword && passwordProblem(password, user)) {
    await db.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
  }
  await createSession(user.id, "PASSWORD");
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
  const now = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  if (next !== String(formData.get("confirm") ?? "")) return { error: "The two new passwords don't match." };
  if (!(await verifyPassword(now, user.passwordHash))) return { error: "Your current password is incorrect." };
  if (now === next) return { error: "Pick a password different from the current one." };
  const problem = passwordProblem(next, user);
  if (problem) return { error: problem };
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date() },
  });
  // Anyone else signed in with the old password is signed out.
  const ended = await endSessions(user.id, session.id);
  await logActivity(user, "LOGINS", "password.changed", `${user.name} changed their password${ended ? ` (signed out ${ended} other ${ended === 1 ? "device" : "devices"})` : ""}`);
  if (formData.get("then") === "home") redirect("/");
  revalidatePath("/account");
  return { ok: ended ? `Password changed. ${ended} other ${ended === 1 ? "device was" : "devices were"} signed out.` : "Password changed." };
}

/** Signs out every other browser this person is signed in on. */
export async function signOutOtherDevices() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const ended = await endSessions(current.user.id, current.session.id);
  if (ended) await logActivity(current.user, "SIGN_IN", "sign-out.others", `${current.user.name} signed out ${ended} other ${ended === 1 ? "device" : "devices"}`);
  revalidatePath("/account");
}
