"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { monthRange } from "@/lib/payroll";
import { draftSlip } from "@/lib/payroll-data";
import type { FormState } from "@/components/action-form";

const money = z.coerce.number().min(0, "Amounts can't be negative").max(10_000_000);

// ─── Salary ────────────────────────────────────────────────────────────────

export async function saveSalary(employeeId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const parsed = z
    .object({
      effectiveFrom: z.string().transform(parseDateOnly),
      basic: money.refine((v) => v > 0, "Enter the basic pay"),
      hra: money,
      specialAllowance: money,
      note: z.string().trim().transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { effectiveFrom, ...data } = parsed.data;
  await db.salaryStructure.upsert({
    where: { employeeId_effectiveFrom: { employeeId, effectiveFrom } },
    update: data,
    create: { employeeId, effectiveFrom, ...data },
  });
  revalidatePath(`/hr/employees/${employeeId}`);
  revalidatePath("/payroll");
  return { ok: "Salary saved." };
}

export async function deleteSalary(id: string) {
  await requireUser(["ADMIN"]);
  const s = await db.salaryStructure.delete({ where: { id } });
  revalidatePath(`/hr/employees/${s.employeeId}`);
}

// ─── Runs ──────────────────────────────────────────────────────────────────

/** Everyone on the rolls at some point in the month. */
function employeesFor(month: string) {
  const { start, end } = monthRange(month);
  return db.employee.findMany({
    where: { dateOfJoining: { lte: end }, OR: [{ dateOfExit: null }, { dateOfExit: { gte: start } }] },
    select: { id: true, dateOfJoining: true, dateOfExit: true },
  });
}

export async function startRun(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const month = String(formData.get("month") ?? "");
  try {
    monthRange(month);
  } catch {
    return { error: "Pick a month." };
  }
  if (await db.payrollRun.findUnique({ where: { month } })) redirect(`/payroll/${month}`);
  const run = await db.payrollRun.create({ data: { month, createdById: user.id } });
  for (const e of await employeesFor(month)) {
    const slip = await draftSlip(e, month);
    if (slip) await db.payslip.create({ data: { runId: run.id, employeeId: e.id, ...slip } });
  }
  revalidatePath("/payroll");
  redirect(`/payroll/${month}`);
}

async function draftRun(runId: string) {
  await requireUser(["ADMIN"]);
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { payslips: true } });
  if (run.status !== "DRAFT") throw new Error("Reopen the payroll before changing it");
  return run;
}

/** Re-reads salaries, joining/exit dates and LOP leave. Keeps hand-entered extras and deductions. */
export async function recalculateRun(runId: string) {
  const run = await draftRun(runId);
  const kept = new Map(run.payslips.map((p) => [p.employeeId, p]));
  await db.payslip.deleteMany({ where: { runId } });
  for (const e of await employeesFor(run.month)) {
    const old = kept.get(e.id);
    const slip = await draftSlip(e, run.month, {
      manual: old && {
        otherEarnings: Number(old.otherEarnings),
        professionalTax: Number(old.professionalTax),
        tds: Number(old.tds),
        otherDeductions: Number(old.otherDeductions),
      },
    });
    if (slip) await db.payslip.create({ data: { runId, employeeId: e.id, ...slip, note: old?.note } });
  }
  revalidatePath(`/payroll/${run.month}`);
}

export async function updateSlip(slipId: string, _: FormState, formData: FormData): Promise<FormState> {
  const slip = await db.payslip.findUniqueOrThrow({ where: { id: slipId }, include: { employee: true } });
  const run = await draftRun(slip.runId);
  const parsed = z
    .object({
      lopDays: z.coerce.number().min(0).max(31).multipleOf(0.5, "LOP days go in half days"),
      otherEarnings: money,
      professionalTax: money.optional(),
      tds: money.optional(),
      otherDeductions: money,
      note: z.string().trim().transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { lopDays, note, ...manual } = parsed.data;
  const next = await draftSlip(slip.employee, run.month, {
    lopDays,
    manual: { ...manual, professionalTax: manual.professionalTax ?? 0, tds: manual.tds ?? 0 },
  });
  if (!next) return { error: "This person has no salary for the month." };
  await db.payslip.update({ where: { id: slipId }, data: { ...next, note } });
  revalidatePath(`/payroll/${run.month}`);
  return { ok: "Updated." };
}

export async function removeSlip(slipId: string) {
  const slip = await db.payslip.findUniqueOrThrow({ where: { id: slipId } });
  const run = await draftRun(slip.runId);
  await db.payslip.delete({ where: { id: slipId } });
  revalidatePath(`/payroll/${run.month}`);
}

export async function finalizeRun(runId: string) {
  const run = await draftRun(runId);
  await db.payrollRun.update({ where: { id: runId }, data: { status: "FINALIZED", finalizedAt: new Date() } });
  revalidatePath(`/payroll/${run.month}`);
  revalidatePath("/payroll");
}

export async function reopenRun(runId: string) {
  await requireUser(["ADMIN"]);
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "FINALIZED") throw new Error("Only a finalized, unpaid payroll can be reopened");
  await db.payrollRun.update({ where: { id: runId }, data: { status: "DRAFT", finalizedAt: null } });
  revalidatePath(`/payroll/${run.month}`);
  revalidatePath("/payroll");
}

export async function markPaid(runId: string, formData: FormData) {
  await requireUser(["ADMIN"]);
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "FINALIZED") throw new Error("Finalize the payroll first");
  const paidOn = parseDateOnly(String(formData.get("paidOn") ?? ""));
  await db.payrollRun.update({ where: { id: runId }, data: { status: "PAID", paidOn } });
  revalidatePath(`/payroll/${run.month}`);
  revalidatePath("/payroll");
}

export async function deleteRun(runId: string) {
  await draftRun(runId);
  await db.payrollRun.delete({ where: { id: runId } });
  revalidatePath("/payroll");
  redirect("/payroll");
}
