import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

/** The kinds of entry in Admin → Activity log. */
export const ACTIVITY_AREAS = {
  SIGN_IN: "Sign-ins",
  LOGINS: "Logins and roles",
  SETTINGS: "Settings",
  PAYROLL: "Payroll",
  MONEY: "Invoices and payments",
  HR: "Exits and certificates",
  DELETED: "Deleted records",
} as const;
export type ActivityArea = keyof typeof ACTIVITY_AREAS;

/** The address a request came from, as well as the app can tell (good enough for a log, not for proof). */
export async function requestIp() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

/** Adds a line to the activity log. Never throws: a failed log line must not undo the action itself. */
export async function logActivity(user: { id: string } | null, area: ActivityArea, action: string, summary: string) {
  try {
    await db.activityLog.create({ data: { userId: user?.id ?? null, area, action, summary: summary.slice(0, 500), ip: await requestIp() } });
  } catch (e) {
    console.error("Could not write the activity log", e);
  }
}

/** "PF enabled, payment terms days" — the settings that differ, for a log line. Values are left out on purpose. */
export function changedSettings(before: Record<string, unknown>, after: Record<string, unknown>) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || String(a ?? "") === String(b ?? "");
  const keys = Object.keys(after).filter((k) => !same(before[k], after[k]));
  return keys.map((k) => k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()).join(", ");
}

export const FAILED_SIGN_IN = ["sign-in.failed", "sign-in.locked", "sign-in.google-unknown"];

/** Wrong passwords and lockouts in the last few days, for the warning on the activity log. */
export function recentFailedSignIns(days = 7) {
  return db.activityLog.count({ where: { action: { in: FAILED_SIGN_IN }, at: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } } });
}
