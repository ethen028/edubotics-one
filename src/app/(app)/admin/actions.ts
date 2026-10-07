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

const roleSchema = z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]);

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

  const before = await db.user.findUniqueOrThrow({ where: { id } });
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

export async function resetPassword(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser(["ADMIN"]);
  const password = String(formData.get("password") ?? "");
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  const weak = passwordProblem(password, user);
  if (weak) return { error: weak };
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: id !== me.id } });
  if (id !== me.id) await endSessions(id);
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
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  const ended = await endSessions(id);
  await logActivity(me, "SIGN_IN", "sign-out.admin", `Signed ${user.name} out on ${ended} ${ended === 1 ? "device" : "devices"}`);
  revalidatePath("/admin/users");
}
