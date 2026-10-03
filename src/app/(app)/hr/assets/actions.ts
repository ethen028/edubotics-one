"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { ASSET_CATEGORIES } from "@/lib/hr-constants";
import type { FormState } from "@/components/action-form";

function refresh(employeeId?: string | null) {
  revalidatePath("/hr/assets");
  if (employeeId) revalidatePath(`/hr/employees/${employeeId}`);
}

const assetSchema = z.object({
  code: z.string().trim().toUpperCase().min(2, "Enter an asset code, e.g. EDU-LAP-021"),
  name: z.string().trim().min(2, "Enter a name"),
  category: z.enum(ASSET_CATEGORIES),
  serialNo: z.string().trim().transform((v) => v || null),
  purchaseDate: z
    .string()
    .trim()
    .transform((v) => (v ? parseDateOnly(v) : null)),
  notes: z.string().trim().transform((v) => v || null),
});

export async function createAsset(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
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
  await requireUser(["ADMIN"]);
  const employeeId = z.string().min(1).parse(formData.get("employeeId"));
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (asset.status !== "AVAILABLE") throw new Error("Only available assets can be assigned");
  await db.asset.update({ where: { id: assetId }, data: { employeeId, status: "ASSIGNED", assignedAt: new Date() } });
  refresh(employeeId);
}

/** Return to stock, send for repair, or retire. Clears the assignment. */
export async function setAssetStatus(assetId: string, formData: FormData) {
  await requireUser(["ADMIN"]);
  const status = z.enum(["AVAILABLE", "REPAIR", "RETIRED"]).parse(formData.get("status"));
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  await db.asset.update({ where: { id: assetId }, data: { status, employeeId: null, assignedAt: null } });
  refresh(asset.employeeId);
}
