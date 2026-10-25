import "server-only";
import { db } from "./db";
import { currentCompanyId } from "./company";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** The current company's settings (one row per company, created with defaults on first use). */
export async function getSettings() {
  const companyId = await currentCompanyId();
  // Signature images are only needed on certificates and letters: see certificateSignature() and letterSignature().
  return db.companySettings.upsert({ where: { companyId }, update: {}, create: { companyId }, omit: { certSignature: true, letterSignature: true } });
}

/** The uploaded signature printed on certificates, or null. */
export async function certificateSignature() {
  const s = await db.companySettings.findFirst({ select: { certSignature: true, certSignatureType: true } });
  return s?.certSignature && s.certSignatureType ? { data: Buffer.from(s.certSignature), type: s.certSignatureType } : null;
}

/** The uploaded signature printed on HR letters and ID cards, or null. */
export async function letterSignature() {
  const s = await db.companySettings.findFirst({ select: { letterSignature: true, letterSignatureType: true } });
  return s?.letterSignature && s.letterSignatureType ? { data: Buffer.from(s.letterSignature), type: s.letterSignatureType } : null;
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;

/** The `where` that names the current company's settings row, for updates. */
export async function thisCompany() {
  return { companyId: await currentCompanyId() };
}
