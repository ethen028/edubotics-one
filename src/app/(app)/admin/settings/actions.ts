"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/components/action-form";

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
  const data = {
    workMinutesPerDay: hours * 60 + minutes,
    overtimeAfterMins,
    weeklyOffDays,
    lopDivisor,
    pfEnabled: on("pfEnabled"),
    esiEnabled: on("esiEnabled"),
    ptEnabled: on("ptEnabled"),
    tdsEnabled: on("tdsEnabled"),
  };
  await db.companySettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}
