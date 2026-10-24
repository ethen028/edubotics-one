"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { endSessions, hashPassword, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { passwordProblem } from "@/lib/passwords";
import { unlockEmail } from "@/lib/sign-in";
import { humanize } from "@/lib/format";
import type { FormState } from "@/components/action-form";

const roleSchema = z.enum(["ADMIN", "HR", "MANAGER", "EMPLOYEE"]);

/** The owner's own login (role, switch-off, password) can only be changed by the owner, so no other admin can take it over. */
async function guardOwner(me: { id: string; isOwner: boolean }, id: string) {
  const target = await db.user.findUniqueOrThrow({ where: { id } });
  if (target.isOwner && !me.isOwner) throw new Error("Only the company owner can change the owner's login");
  return target;
}

export async function createUser(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser(["ADMIN"]);
  const parsed = z
    .object({
      name: z.string().trim().min(1, "required"),
      email: z.string().trim().toLowerCase().email(),
      role: roleSchema,
      password: z.string(),
      employeeId: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `${String(parsed.error.issues[0].path[0])}: ${parsed.error.issues[0].message}` };
  const { employeeId, password, ...data } = parsed.data;
  const weak = passwordProblem(password, data);
  if (weak) return { error: `Temporary password: ${weak}` };
  try {
    await db.user.create({
      data: {
        ...data,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        employee: employeeId ? { connect: { id: employeeId } } : undefined,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "That email already has a login." };
    throw e;
  }
  await logActivity(me, "LOGINS", "login.created", `Created ${data.role === "EMPLOYEE" ? "an" : "a"} ${humanize(data.role).toLowerCase()} login for ${data.name} (${data.email})`);
  revalidatePath("/admin/users");
  return { ok: `Login created for ${data.email}. They'll choose their own password when they first sign in.` };
}

export async function updateUser(id: string, formData: FormData) {
  const me = await requireUser(["ADMIN"]);
  const role = roleSchema.parse(formData.get("role"));
  const active = formData.get("active") === "on";
  const employeeId = String(formData.get("employeeId") ?? "");
  if (id === me.id && (role !== "ADMIN" || !active)) throw new Error("You can't remove your own admin access");

  const before = await guardOwner(me, id);
  if (before.isOwner && (role !== "ADMIN" || !active)) throw new Error("Hand ownership to another admin before changing the owner's role");
  await db.$transaction([
    db.employee.updateMany({ where: { userId: id }, data: { userId: null } }),
    ...(employeeId ? [db.employee.update({ where: { id: employeeId }, data: { userId: id } })] : []),
    db.user.update({ where: { id }, data: { role, active } }),
  ]);
  if (before.role !== role) {
    await logActivity(me, "LOGINS", "login.role", `Changed ${before.name}'s role from ${humanize(before.role)} to ${humanize(role)}`);
  }
  if (before.active !== active) {
    if (!active) await endSessions(id);
    await logActivity(me, "LOGINS", active ? "login.enabled" : "login.disabled", `${active ? "Switched on" : "Switched off"} ${before.name}'s login`);
  }
  revalidatePath("/admin/users");
}

/**
 * Moves a login to another email, e.g. from a personal Gmail to the company address so it can use Teamwork. The old
 * Google link and email check are cleared (they belonged to the old address) and the person is signed out.
 */
export async function changeUserEmail(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser(["ADMIN"]);
  const parsed = z.string().trim().toLowerCase().email("Enter a full email address.").max(200).safeParse(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const before = await guardOwner(me, id);
  if (before.email === parsed.data) return { ok: "Email kept." };
  try {
    await db.user.update({ where: { id }, data: { email: parsed.data, emailVerifiedAt: null, googleSub: null } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "That email already has a login." };
    throw e;
  }
  if (id !== me.id) await endSessions(id);
  await unlockEmail(before.email);
  await logActivity(me, "LOGINS", "login.email", `Changed ${before.name}'s login email from ${before.email} to ${parsed.data}`);
  revalidatePath("/admin/users");
  return { ok: id === me.id ? "Email changed. Sign in with it next time." : `Email changed. ${before.name} signs in with ${parsed.data} from now on.` };
}

export async function resetPassword(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser(["ADMIN"]);
  const password = String(formData.get("password") ?? "");
  if (id !== me.id && (await db.user.findUniqueOrThrow({ where: { id } })).isOwner && !me.isOwner) return { error: "Only the company owner can reset the owner's password." };
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  const weak = passwordProblem(password, user);
  if (weak) return { error: weak };
  const passwordHash = await hashPassword(password);
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
    await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: id !== me.id, passwordChangedAt: now } });
    if (id !== me.id) await tx.session.updateMany({ where: { userId: id, endedAt: null }, data: { endedAt: now } });
    await tx.accountToken.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: now } });
  });
  await unlockEmail(user.email);
  await logActivity(me, "LOGINS", "password.reset", `Set a new temporary password for ${user.name}`);
  revalidatePath("/admin/users");
  return { ok: id === me.id ? "Password updated." : "Password set. They're signed out and will choose their own at the next sign-in." };
}

/** Lets a person try again straight away after being locked out by wrong passwords. */
export async function unlockUser(id: string) {
  const me = await requireUser(["ADMIN"]);
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  await unlockEmail(user.email);
  await logActivity(me, "LOGINS", "login.unlocked", `Unlocked ${user.name}'s login after wrong passwords`);
  revalidatePath("/admin/users");
}

/** Signs a person out on every device, e.g. after a lost phone. */
export async function signOutEverywhere(id: string) {
  const me = await requireUser(["ADMIN"]);
  const user = await guardOwner(me, id);
  const ended = await endSessions(id);
  await logActivity(me, "SIGN_IN", "sign-out.admin", `Signed ${user.name} out on ${ended} ${ended === 1 ? "device" : "devices"}`);
  revalidatePath("/admin/users");
}

/** The owner hands the company over to another active admin: the owner mark moves, both stay admins. */
export async function makeOwner(id: string) {
  const me = await requireUser(["ADMIN"]);
  if (!me.isOwner) throw new Error("Only the company owner can hand over ownership");
  if (id === me.id) return;
  const target = await db.user.findUniqueOrThrow({ where: { id } });
  if (target.role !== "ADMIN" || !target.active || target.closedAt) throw new Error("Make them an active admin first");
  await db.$transaction([
    db.user.updateMany({ where: { isOwner: true }, data: { isOwner: false } }),
    db.user.update({ where: { id }, data: { isOwner: true } }),
  ]);
  await logActivity(me, "LOGINS", "login.owner", `Handed company ownership to ${target.name}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/roles");
}
