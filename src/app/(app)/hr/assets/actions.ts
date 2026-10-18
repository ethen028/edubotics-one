"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { optionalDateOnlyInput } from "@/lib/date-input";
import { ASSET_CATEGORIES } from "@/lib/hr-constants";
import type { FormState } from "@/components/action-form";

function refresh(employeeId?: string | null) {
  revalidatePath("/hr");
  revalidatePath("/hr/assets");
  if (employeeId) revalidatePath(`/hr/employees/${employeeId}`);
}

const assetSchema = z.object({
  code: z.string().trim().toUpperCase().min(2, "Enter an asset code, e.g. EDU-LAP-021"),
  name: z.string().trim().min(2, "Enter a name"),
  category: z.enum(ASSET_CATEGORIES),
  serialNo: z.string().trim().transform((v) => v || null),
  purchaseDate: optionalDateOnlyInput,
  notes: z.string().trim().transform((v) => v || null),
});

export async function createAsset(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN", "HR"]);
  const parsed = assetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await db.asset.create({ data: parsed.data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "That asset code is already used." };
    throw e;
  }
  refresh();
  return { ok: `${parsed.data.code} added.` };
}

export async function assignAsset(assetId: string, formData: FormData) {
  await requireUser(["ADMIN", "HR"]);
  const employeeId = z.string().min(1).parse(formData.get("employeeId"));
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (asset.status !== "AVAILABLE") throw new Error("Only available assets can be assigned");
  const employee = await db.employee.findFirst({ where: { id: employeeId, status: { not: "EXITED" } }, select: { id: true } });
  if (!employee) throw new Error("Choose a current employee.");
  const changed = await db.asset.updateMany({ where: { id: assetId, status: "AVAILABLE" }, data: { employeeId, status: "ASSIGNED", assignedAt: new Date() } });
  if (!changed.count) throw new Error("The asset was already assigned or its status changed. Reload.");
  refresh(employeeId);
}

/** Return to stock, send for repair, or retire. Clears the assignment. */
export async function setAssetStatus(assetId: string, formData: FormData) {
  await requireUser(["ADMIN", "HR"]);
  const status = z.enum(["AVAILABLE", "REPAIR", "RETIRED"]).parse(formData.get("status"));
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  await db.asset.update({ where: { id: assetId }, data: { status, employeeId: null, assignedAt: null } });
  refresh(asset.employeeId);
}
