import "server-only";
import { db } from "./db";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Company-wide settings (a single row, created with defaults on first use). */
export function getSettings() {
  // Signature images are only needed on certificates and letters: see certificateSignature() and letterSignature().
  return db.companySettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 }, omit: { certSignature: true, letterSignature: true } });
}

/** The uploaded signature printed on certificates, or null. */
export async function certificateSignature() {
  const s = await db.companySettings.findUnique({ where: { id: 1 }, select: { certSignature: true, certSignatureType: true } });
  return s?.certSignature && s.certSignatureType ? { data: Buffer.from(s.certSignature), type: s.certSignatureType } : null;
}

/** The uploaded signature printed on HR letters and ID cards, or null. */
export async function letterSignature() {
  const s = await db.companySettings.findUnique({ where: { id: 1 }, select: { letterSignature: true, letterSignatureType: true } });
  return s?.letterSignature && s.letterSignatureType ? { data: Buffer.from(s.letterSignature), type: s.letterSignatureType } : null;
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;
