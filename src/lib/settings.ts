import "server-only";
import { db } from "./db";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Company-wide settings (a single row, created with defaults on first use). */
export function getSettings() {
  return db.companySettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;
