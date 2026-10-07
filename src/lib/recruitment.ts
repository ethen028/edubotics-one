import "server-only";
import type { CandidateStage } from "@prisma/client";
import { db } from "./db";
import { isAdmin, isManagerOrAdmin, type CurrentUser } from "./auth";

export const CANDIDATE_SOURCES = [
  "Referral",
  "Website",
  "LinkedIn",
  "Naukri",
  "Indeed",
  "Campus",
  "Walk-in",
  "Social media",
  "Other",
] as const;

export const INTERVIEW_ROUNDS = ["Phone screen", "Technical", "Demo class", "HR / final", "Other"] as const;
export const INTERVIEW_MODES = ["In person", "Video call", "Phone"] as const;
export const FILE_KINDS = ["Resume", "Portfolio", "Certificate", "Other"] as const;

/** Stages a candidate can be moved to by hand. Offer and hired follow from the offer and hire steps. */
export const PIPELINE_STAGES = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED"] as const;
export const OPEN_STAGES: CandidateStage[] = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"];

/** Managers and admins run hiring. Everyone else only sees candidates they interview. */
export const canRecruit = isManagerOrAdmin;
/** Offers carry salary, so only admins make them and move hires into HR (like payroll). */
export const canOffer = isAdmin;

/**
 * How much of a candidate this user may see: "full" for managers and admins,
 * "interviewer" for someone with an interview on them, otherwise null.
 */
export async function candidateAccess(user: CurrentUser, candidateId: string): Promise<"full" | "interviewer" | null> {
  if (canRecruit(user)) return "full";
  const interview = await db.interview.findFirst({ where: { candidateId, interviewerId: user.id }, select: { id: true } });
  return interview ? "interviewer" : null;
}

/** "2026-10-08T14:30" typed in India time → the UTC instant. */
export function parseISTDateTime(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Invalid date and time");
  return new Date(`${value}:00+05:30`);
}

/** The reverse, for <input type="datetime-local">. */
export function toISTInput(d: Date) {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 16);
}

/** Interviews this user still has to hold or give feedback on. */
export function myOpenInterviews(userId: string) {
  return db.interview.findMany({
    where: { interviewerId: userId, status: "SCHEDULED" },
    include: { candidate: { select: { id: true, name: true, job: { select: { title: true } } } } },
    orderBy: { scheduledAt: "asc" },
  });
}
