"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireUser } from "@/lib/auth";
import type { FormState } from "@/components/action-form";

const roleSchema = z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]);

export async function createUser(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const parsed = z
    .object({
      name: z.string().trim().min(1, "required"),
      email: z.string().trim().toLowerCase().email(),
      role: roleSchema,
      password: z.string().min(8, "must be at least 8 characters"),
      employeeId: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `${String(parsed.error.issues[0].path[0])}: ${parsed.error.issues[0].message}` };
  const { employeeId, password, ...data } = parsed.data;
  try {
    await db.user.create({
      data: {
        ...data,
        passwordHash: await hashPassword(password),
        employee: employeeId ? { connect: { id: employeeId } } : undefined,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "That email already has a login." };
    throw e;
  }
  revalidatePath("/admin/users");
  return { ok: `Login created for ${data.email}.` };
}

export async function updateUser(id: string, formData: FormData) {
  const me = await requireUser(["ADMIN"]);
  const role = roleSchema.parse(formData.get("role"));
  const active = formData.get("active") === "on";
  const employeeId = String(formData.get("employeeId") ?? "");
  if (id === me.id && (role !== "ADMIN" || !active)) throw new Error("You can't remove your own admin access");

  await db.$transaction([
    db.employee.updateMany({ where: { userId: id }, data: { userId: null } }),
    ...(employeeId ? [db.employee.update({ where: { id: employeeId }, data: { userId: id } })] : []),
    db.user.update({ where: { id }, data: { role, active } }),
  ]);
  revalidatePath("/admin/users");
}

export async function resetPassword(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  return { ok: "Password updated." };
}
