"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/components/action-form";
import { getSettings } from "@/lib/settings";
import { changedSettings, logActivity } from "@/lib/activity";
import { backupDir, runBackup } from "@/lib/backups";
import { formatSize } from "@/lib/project-files";

export async function backUpNow(): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  if (!backupDir()) return { error: "Backups only run on the office computer, in the Docker setup." };
  const result = await runBackup("manual");
  revalidatePath("/admin/backups");
  if (!result.ok) {
    await logActivity(admin, "BACKUPS", "backup.failed", `Back up now failed: ${result.error ?? ""}`);
    return { error: `The backup failed: ${result.error}` };
  }
  await logActivity(admin, "BACKUPS", "backup.manual", `Backed up now (${formatSize(result.size ?? 0)})`);
  if (result.copyError) return { error: `Backed up on this computer, but the copy to the second folder failed: ${result.copyError}` };
  return { ok: `Backed up (${formatSize(result.size ?? 0)}).` };
}

export async function updateBackupSettings(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = z
    .object({
      backupsEnabled: z.boolean(),
      backupHour: z.coerce.number().int().min(0).max(23),
      backupKeepDays: z.coerce.number().int().min(3, "Keep daily backups for at least 3 days.").max(365, "Keep daily backups for at most 365 days."),
      backupKeepMonths: z.coerce.number().int().min(0).max(120, "Keep monthly backups for at most 120 months."),
    })
    .safeParse({ ...Object.fromEntries(formData), backupsEnabled: formData.get("backupsEnabled") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const before = await getSettings();
  await db.companySettings.update({ where: { id: 1 }, data: parsed.data });
  const changed = changedSettings(before, parsed.data);
  if (changed) await logActivity(admin, "BACKUPS", "settings.backups", `Changed backup settings: ${changed}`);
  revalidatePath("/admin/backups");
  return { ok: "Saved." };
}
