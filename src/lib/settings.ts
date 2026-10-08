import "server-only";
import { db } from "./db";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Company-wide settings (a single row, created with defaults on first use). */
export function getSettings() {
  // The certificate signature image is only needed for certificates: see certificateSignature().
  return db.companySettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 }, omit: { certSignature: true } });
}

/** The uploaded signature printed on certificates, or null. */
export async function certificateSignature() {
  const s = await db.companySettings.findUnique({ where: { id: 1 }, select: { certSignature: true, certSignatureType: true } });
  return s?.certSignature && s.certSignatureType ? { data: Buffer.from(s.certSignature), type: s.certSignatureType } : null;
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;
