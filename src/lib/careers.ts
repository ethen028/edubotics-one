import "server-only";
import { db } from "./db";
import { todayIST } from "./time";

/**
 * The careers page is the one part of Edubotics One meant for people outside the company.
 * Everything it shows goes through these selects, so nothing about staff (salary ranges,
 * hiring managers, candidates, who created the job) can leak onto it by accident.
 */
export const PUBLIC_JOB_SELECT = {
  id: true,
  title: true,
  employmentType: true,
  location: true,
  description: true,
  applyBy: true,
  createdAt: true,
  department: { select: { name: true } },
} as const;

/** What the public page shows about the company: name, intro and a contact email only. */
export async function careersSettings() {
  const s = await db.companySettings.findUnique({
    where: { id: 1 },
    select: { careersEnabled: true, careersIntro: true, careersContactEmail: true, companyName: true },
  });
  return {
    enabled: s?.careersEnabled ?? false,
    intro: s?.careersIntro ?? null,
    contactEmail: s?.careersContactEmail ?? null,
    companyName: s?.companyName ?? "Edubotics Global",
  };
}

/** Jobs that take applications on the careers page right now. */
export function listedWhere() {
  return {
    status: "OPEN" as const,
    onCareersPage: true,
    OR: [{ applyBy: null }, { applyBy: { gte: todayIST() } }],
  };
}

/** Whether a job is past its "apply by" day (so it has dropped off the careers page). */
export function pastApplyBy(job: { applyBy: Date | null }) {
  return job.applyBy !== null && job.applyBy < todayIST();
}

export function publicJobs() {
  return db.jobOpening.findMany({ where: listedWhere(), select: PUBLIC_JOB_SELECT, orderBy: { createdAt: "desc" } });
}

export function publicJob(id: string) {
  return db.jobOpening.findFirst({ where: { id, ...listedWhere() }, select: PUBLIC_JOB_SELECT });
}

/** Online applications nobody has moved past "Applied" yet: the badge on Recruitment. */
export function newOnlineApplications() {
  return db.candidate.count({ where: { appliedOnlineAt: { not: null }, stage: "APPLIED" } });
}

// ─── Flood protection ──────────────────────────────────────────────────────
// The app runs as one process on the office computer, so a small in-memory window is enough
// to stop one address (or a bot) filling Recruitment with junk. It resets on restart.

const WINDOW_MS = 60 * 60 * 1000;
const PER_ADDRESS = 5;
const OVERALL = 60;
const hits = new Map<string, number[]>();

/** Records an attempt and says whether it is within the limits (5 an hour per address, 60 an hour overall). */
export function allowApplication(address: string, now = Date.now()) {
  const recent = (key: string) => (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const mine = recent(address);
  const all = recent("*");
  if (mine.length >= PER_ADDRESS || all.length >= OVERALL) return false;
  hits.set(address, [...mine, now]);
  hits.set("*", [...all, now]);
  if (hits.size > 5000) hits.clear(); // keep memory bounded if many addresses come by
  return true;
}

/** The visitor's address, as passed on by a tunnel or reverse proxy in front of the app. */
export function clientAddress(headers: Headers) {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip") ?? "unknown";
}
