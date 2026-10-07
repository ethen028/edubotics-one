/** Workshop rules and labels, shared by pages, actions and the certificate PDF. No database access here. */
import type { Role, WorkshopAudience, WorkshopFeeType, WorkshopMode, WorkshopStatus } from "@prisma/client";
import { formatDate } from "./format";

export const WORKSHOP_AUDIENCES = ["COLLEGE", "PROFESSIONAL", "SCHOOL", "OTHER"] as const satisfies readonly WorkshopAudience[];
export const WORKSHOP_MODES = ["IN_PERSON", "ONLINE"] as const satisfies readonly WorkshopMode[];
export const WORKSHOP_FEE_TYPES = ["PER_PERSON", "INSTITUTION", "FREE"] as const satisfies readonly WorkshopFeeType[];
export const WORKSHOP_STATUSES = ["UPCOMING", "COMPLETED", "CANCELLED"] as const satisfies readonly WorkshopStatus[];

export const audienceLabel: Record<WorkshopAudience, string> = {
  COLLEGE: "College students",
  PROFESSIONAL: "Professionals",
  SCHOOL: "School students",
  OTHER: "Other",
};

export const modeLabel: Record<WorkshopMode, string> = { IN_PERSON: "In person", ONLINE: "Online" };

export const feeTypeLabel: Record<WorkshopFeeType, string> = {
  PER_PERSON: "Each participant pays",
  INSTITUTION: "The host institution pays (invoice)",
  FREE: "Free",
};

export const statusLabel: Record<WorkshopStatus, string> = { UPCOMING: "Upcoming", COMPLETED: "Completed", CANCELLED: "Cancelled" };

export const CERTIFICATE_TITLES = ["Certificate of Participation", "Certificate of Completion", "Certificate of Achievement"] as const;

const DAY = 86400000;

/** Every date from the first day to the last, as UTC midnights (matches Postgres DATE columns). */
export function workshopDays(w: { startDate: Date; endDate: Date }) {
  const days: Date[] = [];
  for (let t = w.startDate.getTime(); t <= w.endDate.getTime() && days.length < 60; t += DAY) days.push(new Date(t));
  return days;
}

/** "12 Oct 2026" or "12 – 14 Oct 2026" or "30 Oct – 1 Nov 2026". */
export function dateSpan(w: { startDate: Date; endDate: Date }) {
  const a = w.startDate;
  const b = w.endDate;
  if (a.getTime() === b.getTime()) return formatDate(a);
  const opts = (o: Intl.DateTimeFormatOptions) => ({ ...o, timeZone: "UTC" });
  const day = (d: Date) => d.toLocaleDateString("en-IN", opts({ day: "numeric" }));
  const dayMonth = (d: Date) => d.toLocaleDateString("en-IN", opts({ day: "numeric", month: "short" }));
  const full = (d: Date) => d.toLocaleDateString("en-IN", opts({ day: "numeric", month: "short", year: "numeric" }));
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${full(a)} – ${full(b)}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${dayMonth(a)} – ${full(b)}`;
  return `${day(a)} – ${full(b)}`;
}

/** Days someone must attend for a certificate: the workshop's percentage of its days, at least one. */
export function daysNeeded(totalDays: number, minAttendancePct: number) {
  return Math.max(1, Math.ceil((totalDays * minAttendancePct) / 100 - 1e-9));
}

export function certificateNumber(prefix: string, fy: string, seq: number) {
  return `${prefix}/CERT/${fy}/${String(seq).padStart(4, "0")}`;
}

/** Admins and managers run every workshop; its coordinator runs their own. */
export function canManageWorkshop(user: { id: string; role: Role }, w: { coordinatorId: string }) {
  return user.role === "ADMIN" || user.role === "MANAGER" || w.coordinatorId === user.id;
}

/** Trainers on the workshop mark attendance as well as whoever manages it. */
export function canMarkAttendance(
  user: { id: string; role: Role },
  w: { coordinatorId: string; trainers: { userId: string }[] },
) {
  return canManageWorkshop(user, w) || w.trainers.some((t) => t.userId === user.id);
}

type Money = { toString(): string };

export type Standing = {
  attended: number;
  marked: number;
  paid: number;
  due: number;
  /** Why no certificate yet, or null when one can be issued. */
  blocker: string | null;
};

/**
 * Where one participant stands: days attended, fee paid and still due, and whether they have earned a
 * certificate. Certificates wait until the last day has been reached.
 */
export function standing(
  w: { startDate: Date; endDate: Date; minAttendancePct: number; feeType: WorkshopFeeType; certNeedsPayment: boolean; status: WorkshopStatus },
  r: { status: string; fee: Money; payments: { amount: Money }[]; attendance: { present: boolean }[] },
  today: Date,
): Standing {
  const total = workshopDays(w).length;
  const attended = r.attendance.filter((a) => a.present).length;
  const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0);
  const due = w.feeType === "PER_PERSON" ? Math.max(0, Math.round((Number(r.fee) - paid) * 100) / 100) : 0;
  const needed = daysNeeded(total, w.minAttendancePct);
  let blocker: string | null = null;
  if (r.status !== "REGISTERED") blocker = "Registration cancelled";
  else if (w.status === "CANCELLED") blocker = "Workshop cancelled";
  else if (today < w.endDate && w.status !== "COMPLETED") blocker = "Workshop not over yet";
  else if (attended < needed) blocker = total === 1 ? "Not marked present" : `Attended ${attended} of ${total} days, needs ${needed}`;
  else if (w.certNeedsPayment && due > 0) blocker = "Fee not fully paid";
  return { attended, marked: r.attendance.length, paid, due, blocker };
}

/** The sentence under the name on a certificate. */
export function certificateWording(
  w: { title: string; startDate: Date; endDate: Date; hours: Money | null; venue: string | null; mode: WorkshopMode },
  orgName: string | null,
  companyName: string,
) {
  const where = w.mode === "ONLINE" ? "online" : orgName ? `at ${orgName}` : w.venue ? `at ${w.venue}` : null;
  const hours = w.hours != null && Number(w.hours) > 0 ? `${Number(w.hours)}-hour` : null;
  const one = w.startDate.getTime() === w.endDate.getTime();
  return [
    `has successfully participated in the ${hours ? `${hours} ` : ""}workshop`,
    `“${w.title}”`,
    `conducted by ${companyName}${where ? ` ${where}` : ""} ${one ? "on" : "from"} ${one ? formatDate(w.startDate) : dateSpan(w).replace(" – ", " to ")}.`,
  ];
}

/**
 * Registrations pasted from a spreadsheet or a Google Form export: one person per line, columns
 * separated by tabs or commas in the order name, email, phone, institution, course or designation.
 * A header row is skipped.
 */
export function parsePastedRegistrations(text: string) {
  const rows: { name: string; email: string | null; phone: string | null; institution: string | null; detail: string | null }[] = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (/^(full\s*)?name$/i.test(cells[0]) || /^timestamp$/i.test(cells[0])) continue;
    const [name, ...rest] = cells;
    // Pick the email and phone out wherever they sit, then keep the rest in order.
    const email = rest.find((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) ?? null;
    const phone = rest.find((c) => c !== email && /^[+\d][\d\s-]{6,}$/.test(c)) ?? null;
    const others = rest.filter((c) => c && c !== email && c !== phone);
    if (!name || name.length > 120 || /@/.test(name)) {
      skipped.push(line.slice(0, 60));
      continue;
    }
    rows.push({ name, email: email?.toLowerCase() ?? null, phone, institution: others[0] ?? null, detail: others.slice(1).join(", ") || null });
  }
  return { rows, skipped };
}
