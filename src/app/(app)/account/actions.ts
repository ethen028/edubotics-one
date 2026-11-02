"use server";

import { revalidatePath } from "next/cache";
import { rawDb as db } from "@/lib/db"; // your own login, across the group
import { endSessions, getCurrentSession, requireUser, verifyPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { allowRequest } from "@/lib/rate-limit";
import { beginCodeSetup, confirmCodeSetup, replaceBackupCodes, turnOffCodes } from "@/lib/sign-in-codes";

/** What the sign-in codes card shows after a step: a message, and the backup codes right after they're made. */
export type CodesState = { error?: string; ok?: string; codes?: string[] } | undefined;

async function passwordIsRight(user: { id: string; passwordHash: string }, typed: FormDataEntryValue | null) {
  if (!(await allowRequest("account-password", user.id, 10, 900000))) return false;
  return typeof typed === "string" && typed.length <= 200 && verifyPassword(typed, user.passwordHash);
}

/** Makes a new app key to add to an authenticator app. Codes aren't asked for until one is confirmed. */
export async function startSignInCodes(): Promise<void> {
  const me = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (user.totpEnabledAt) return;
  await beginCodeSetup(me.id);
  revalidatePath("/account");
}

export async function cancelSignInCodeSetup(): Promise<void> {
  const me = await requireUser();
  await db.user.updateMany({ where: { id: me.id, totpEnabledAt: null }, data: { totpSecret: null } });
  revalidatePath("/account");
}

export async function confirmSignInCodes(_: CodesState, formData: FormData): Promise<CodesState> {
  const me = await requireUser();
  if (!(await allowRequest("code-setup", me.id, 10, 900000))) return { error: "Too many tries. Wait 15 minutes." };
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  const codes = await confirmCodeSetup(user, String(formData.get("code") ?? ""));
  if (!codes) return { error: "That code didn't match. Check the key was typed exactly, then try the newest code." };
  await logActivity(me, "SIGN_IN", "sign-in-codes.on", `${me.name} switched on sign-in codes`);
  revalidatePath("/account");
  return { ok: "Sign-in codes are on.", codes };
}

export async function newSignInBackupCodes(_: CodesState, formData: FormData): Promise<CodesState> {
  const me = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!user.totpEnabledAt) return { error: "Sign-in codes are off." };
  if (!(await passwordIsRight(user, formData.get("password")))) return { error: "Your password is incorrect." };
  const codes = await replaceBackupCodes(me.id);
  await logActivity(me, "SIGN_IN", "sign-in-codes.backup", `${me.name} made new backup codes`);
  revalidatePath("/account");
  return { ok: "New backup codes made. The old ones no longer work.", codes };
}

export async function turnOffSignInCodes(_: CodesState, formData: FormData): Promise<CodesState> {
  const me = await requireUser();
  const current = await getCurrentSession();
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!user.totpEnabledAt) return { error: "Sign-in codes are already off." };
  if (!(await passwordIsRight(user, formData.get("password")))) return { error: "Your password is incorrect." };
  await turnOffCodes(me.id);
  await endSessions(me.id, current?.session.id);
  await logActivity(me, "SIGN_IN", "sign-in-codes.off", `${me.name} switched off sign-in codes`);
  revalidatePath("/account");
  return { ok: "Sign-in codes are off. Your other devices were signed out." };
}
