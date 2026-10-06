"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/components/action-form";
import { GST_RATES, INDIAN_STATES } from "@/lib/invoices";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();

const invoiceSettings = z.object({
  companyName: z.string().trim().min(1, "Enter the company name.").max(120),
  companyAddress: z.string().trim().min(1, "Enter the company address.").max(400),
  companyState: z.enum(INDIAN_STATES),
  companyPhone: text(40),
  companyEmail: text(120),
  pan: text(10).transform((v) => v?.toUpperCase() ?? null),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "A GSTIN has 15 letters and digits.")
    .transform((v) => v || null),
  defaultGstRate: z.coerce.number().refine((r) => (GST_RATES as readonly number[]).includes(r), "Pick a GST rate."),
  defaultSac: text(10),
  invoicePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,6}$/, "The invoice prefix is up to 6 letters or digits."),
  paymentTermsDays: z.coerce.number().int().min(0).max(180),
  bankName: text(80),
  bankAccountName: text(120),
  bankAccountNo: text(30),
  bankIfsc: text(11).transform((v) => v?.toUpperCase() ?? null),
  upiId: text(80),
  invoiceNote: text(500),
});

export async function updateSettings(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const parsed = z
    .object({
      hours: z.coerce.number().int().min(1).max(16),
      minutes: z.coerce.number().int().min(0).max(59),
      overtimeAfterMins: z.coerce.number().int().min(0).max(600),
      weeklyOffDays: z.array(z.coerce.number().int().min(0).max(6)).max(6),
      lopDivisor: z.coerce.number().int().min(20).max(31),
    })
    .safeParse({
      hours: formData.get("hours"),
      minutes: formData.get("minutes"),
      overtimeAfterMins: formData.get("overtimeAfterMins"),
      weeklyOffDays: formData.getAll("weeklyOffDays"),
      lopDivisor: formData.get("lopDivisor"),
    });
  if (!parsed.success) return { error: "Check the hours, overtime minutes, weekly offs and LOP divisor." };
  const { hours, minutes, overtimeAfterMins, weeklyOffDays, lopDivisor } = parsed.data;
  const on = (k: string) => formData.get(k) === "on";
  const invoicing = invoiceSettings.safeParse(Object.fromEntries(formData));
  if (!invoicing.success) return { error: invoicing.error.issues[0].message };
  const data = {
    workMinutesPerDay: hours * 60 + minutes,
    overtimeAfterMins,
    weeklyOffDays,
    lopDivisor,
    pfEnabled: on("pfEnabled"),
    esiEnabled: on("esiEnabled"),
    ptEnabled: on("ptEnabled"),
    tdsEnabled: on("tdsEnabled"),
    ...invoicing.data,
    gstEnabled: on("gstEnabled"),
  };
  await db.companySettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}
