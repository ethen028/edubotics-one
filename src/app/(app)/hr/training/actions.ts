"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManage } from "@/lib/team";
import type { FormState } from "@/components/action-form";

function refresh(employeeId?: string) {
  revalidatePath("/hr/training");
  if (employeeId) revalidatePath(`/hr/employees/${employeeId}`);
}

export async function createModule(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const parsed = z
    .object({ title: z.string().trim().min(2, "Enter a title"), description: z.string().trim().transform((v) => v || null) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await db.trainingModule.create({ data: parsed.data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "A module with that title exists." };
    throw e;
  }
  refresh();
  return { ok: "Module added." };
}

export async function toggleModule(moduleId: string) {
  await requireUser(["ADMIN"]);
  const m = await db.trainingModule.findUniqueOrThrow({ where: { id: moduleId } });
  await db.trainingModule.update({ where: { id: moduleId }, data: { active: !m.active } });
  refresh();
}

/** Assigns one module, or every active module when moduleId is "ALL". */
export async function assignTraining(employeeId: string, formData: FormData) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  if (!(await canManage(user, employeeId))) throw new Error("Not allowed");
  const moduleId = z.string().min(1).parse(formData.get("moduleId"));
  const modules =
    moduleId === "ALL"
      ? await db.trainingModule.findMany({ where: { active: true }, select: { id: true } })
      : [{ id: moduleId }];
  await db.trainingAssignment.createMany({
    data: modules.map((m) => ({ employeeId, moduleId: m.id })),
    skipDuplicates: true,
  });
  refresh(employeeId);
}

export async function setTrainingStatus(assignmentId: string, formData: FormData) {
  const user = await requireUser();
  const a = await db.trainingAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  if (user.employee?.id !== a.employeeId && !(await canManage(user, a.employeeId))) throw new Error("Not allowed");
  const status = z.enum(["ASSIGNED", "IN_PROGRESS", "COMPLETED"]).parse(formData.get("status"));
  await db.trainingAssignment.update({
    where: { id: assignmentId },
    data: { status, completedAt: status === "COMPLETED" ? new Date() : null },
  });
  refresh(a.employeeId);
}

export async function removeTraining(assignmentId: string) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const a = await db.trainingAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  if (!(await canManage(user, a.employeeId))) throw new Error("Not allowed");
  await db.trainingAssignment.delete({ where: { id: assignmentId } });
  refresh(a.employeeId);
}
