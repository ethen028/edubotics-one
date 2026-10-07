"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { canManage } from "@/lib/team";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/time";
import { MAX_DOCUMENT_BYTES, sniffMime } from "@/lib/hr-constants";
import { EXPENSE_CATEGORIES, VEHICLES } from "@/lib/expenses";
import type { FormState } from "@/components/action-form";

function refresh() {
  revalidatePath("/expenses", "layout");
  revalidatePath("/approvals");
  revalidatePath("/");
}

const optionalId = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null);

const claimSchema = z.object({
  date: z.string().trim().min(1, "Pick the date you spent it").transform(parseDateOnly),
  category: z.enum(EXPENSE_CATEGORIES, "Pick a category"),
  description: z.string().trim().min(3, "Say what it was for").max(300),
  amount: z.coerce.number().min(0).max(1_000_000, "That's more than ₹10 lakh; split it or ask an admin"),
  vehicle: z.enum(VEHICLES).optional().or(z.literal("").transform(() => undefined)),
  distanceKm: z.coerce.number().min(0).max(2000, "More than 2,000 km in one claim? Split it by day").optional(),
  projectId: optionalId,
  organizationId: optionalId,
});

/** An employee claims money back. Admins' own claims are approved straight away, as they approve everyone else's. */
export async function submitClaim(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.employee) return { error: "Expense claims need an employee record linked to your login. Ask an admin." };
  const raw = Object.fromEntries(formData);
  const parsed = claimSchema.safeParse({ ...raw, distanceKm: raw.distanceKm === "" ? undefined : raw.distanceKm });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { date, category, description, projectId, organizationId } = parsed.data;
  if (date > todayIST()) return { error: "The date can't be in the future." };

  // Own-vehicle travel: paid per km when a rate is set under Settings.
  const ownVehicle = category === "TRAVEL" ? parsed.data.vehicle : undefined;
  const distanceKm = ownVehicle ? parsed.data.distanceKm : undefined;
  let amount = parsed.data.amount;
  if (ownVehicle) {
    if (!distanceKm) return { error: "Enter the distance travelled in km." };
    const s = await getSettings();
    const rate = Number(ownVehicle === "CAR" ? s.carRatePerKm : s.twoWheelerRatePerKm);
    if (rate > 0) amount = Math.round(distanceKm * rate * 100) / 100;
  }
  if (amount <= 0) return { error: "Enter the amount spent." };

  if (projectId && !(await db.project.findUnique({ where: { id: projectId }, select: { id: true } })))
    return { error: "That project no longer exists." };
  if (organizationId && !(await db.organization.findUnique({ where: { id: organizationId }, select: { id: true } })))
    return { error: "That institution no longer exists." };

  let receipt: { fileName: string; mimeType: string; size: number; data: Uint8Array<ArrayBuffer> } | undefined;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_DOCUMENT_BYTES) return { error: "Receipts can be up to 5 MB." };
    const data = new Uint8Array(await file.arrayBuffer());
    const mimeType = sniffMime(data);
    if (!mimeType) return { error: "Attach the receipt as a photo (JPG, PNG, WebP) or a PDF." };
    receipt = { fileName: file.name.slice(0, 200) || "receipt", mimeType, size: file.size, data };
  }

  const auto = isAdmin(user);
  await db.expenseClaim.create({
    data: {
      employeeId: user.employee.id,
      date,
      category,
      description,
      amount,
      vehicle: ownVehicle ?? null,
      distanceKm: distanceKm ?? null,
      projectId,
      organizationId,
      ...(auto ? { status: "APPROVED", approvedAmount: amount, decidedById: user.id, decidedAt: new Date() } : {}),
      ...(receipt ? { receipt: { create: receipt } } : {}),
    },
  });
  refresh();
  return { ok: auto ? "Claim added and approved." : "Claim sent for approval." };
}

/** The employee takes back a claim that hasn't been approved, or clears a rejected one. */
export async function withdrawClaim(id: string) {
  const user = await requireUser();
  const claim = await db.expenseClaim.findUnique({ where: { id } });
  if (!claim || claim.employeeId !== user.employee?.id) return;
  if (claim.status !== "SUBMITTED" && claim.status !== "REJECTED") throw new Error("Approved claims can't be withdrawn");
  await db.expenseClaim.delete({ where: { id } });
  refresh();
}

/** The employee's manager or an admin approves (optionally a lower amount) or rejects. */
export async function decideClaim(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const claim = await db.expenseClaim.findUnique({ where: { id } });
  if (!claim || claim.status !== "SUBMITTED") return;
  if (claim.employeeId === user.employee?.id || !(await canManage(user, claim.employeeId))) throw new Error("Not allowed");
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const claimed = Number(claim.amount);
  const asked = String(formData.get("approvedAmount") ?? "").trim();
  const approvedAmount = asked === "" ? claimed : Math.min(claimed, Math.max(0, Number(asked) || 0));
  if (decision === "APPROVED" && approvedAmount <= 0) throw new Error("Approve an amount above zero, or reject the claim");
  await db.expenseClaim.update({
    where: { id },
    data: {
      status: decision,
      approvedAmount: decision === "APPROVED" ? approvedAmount : null,
      decisionNote: note,
      decidedById: user.id,
      decidedAt: new Date(),
    },
  });
  refresh();
}

/** An admin records an approved claim as paid outside payroll (cash, UPI, bank transfer). */
export async function markClaimPaid(id: string, formData: FormData) {
  await requireUser(["ADMIN"]);
  const claim = await db.expenseClaim.findUnique({ where: { id } });
  if (!claim || claim.status !== "APPROVED") return;
  if (claim.payslipId) throw new Error("This claim is on a payroll run; it is paid with the salary");
  const paidOn = parseDateOnly(String(formData.get("paidOn") ?? ""));
  const paidNote = String(formData.get("paidNote") ?? "").trim().slice(0, 100) || null;
  await db.expenseClaim.update({ where: { id }, data: { status: "PAID", paidOn, paidNote } });
  refresh();
}
