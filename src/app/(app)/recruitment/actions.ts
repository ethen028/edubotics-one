"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireUser, type CurrentUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { MAX_DOCUMENT_BYTES, checklistRows, sniffMime } from "@/lib/hr-constants";
import {
  CANDIDATE_SOURCES,
  FILE_KINDS,
  INTERVIEW_MODES,
  INTERVIEW_ROUNDS,
  canOffer,
  canRecruit,
  parseISTDateTime,
} from "@/lib/recruitment";
import type { FormState } from "@/components/action-form";

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const optionalNumber = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().min(0).nullable())
  .optional();
const employmentType = z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]);

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return `${issue.path.join(".") || "Form"}: ${issue.message}`;
}

async function requireRecruiter() {
  const user = await requireUser();
  if (!canRecruit(user)) redirect("/?denied=1");
  return user;
}

async function requireOfferMaker() {
  const user = await requireUser();
  if (!canOffer(user)) redirect("/?denied=1");
  return user;
}

function refresh(candidateId?: string, jobId?: string) {
  revalidatePath("/recruitment", "layout");
  if (candidateId) revalidatePath(`/recruitment/candidates/${candidateId}`);
  if (jobId) revalidatePath(`/recruitment/jobs/${jobId}`);
  revalidatePath("/");
}

// ─── Job openings ──────────────────────────────────────────────────────────

const jobSchema = z.object({
  title: z.string().trim().min(2, "required"),
  departmentId: optional,
  employmentType,
  location: optional,
  positions: z.coerce.number().int().min(1, "at least 1").max(50),
  salaryRange: optional,
  description: optional,
  hiringManagerId: optional,
});

export async function createJob(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRecruiter();
  const parsed = jobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const job = await db.jobOpening.create({ data: { ...parsed.data, createdById: user.id } });
  refresh();
  redirect(`/recruitment/jobs/${job.id}`);
}

export async function updateJob(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireRecruiter();
  const parsed = jobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await db.jobOpening.update({ where: { id }, data: parsed.data });
  refresh(undefined, id);
  return { ok: "Saved." };
}

export async function setJobStatus(id: string, formData: FormData) {
  await requireRecruiter();
  const status = z.enum(["OPEN", "ON_HOLD", "FILLED", "CLOSED"]).parse(formData.get("status"));
  await db.jobOpening.update({
    where: { id },
    data: { status, closedAt: status === "FILLED" || status === "CLOSED" ? new Date() : null },
  });
  refresh(undefined, id);
}

// ─── Candidates ────────────────────────────────────────────────────────────

const candidateSchema = z.object({
  jobId: z.string().min(1, "choose a job"),
  name: z.string().trim().min(2, "required"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.string().email().nullable()),
  phone: optional,
  city: optional,
  source: z.enum(CANDIDATE_SOURCES),
  referredBy: optional,
  currentRole: optional,
  experienceYears: optionalNumber,
  expectedSalary: optionalNumber,
  noticePeriod: optional,
  notes: optional,
});

/** Reads an uploaded file, checking its size and real type. Returns null when none was chosen. */
async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_DOCUMENT_BYTES) return { error: "Files can be up to 5 MB." } as const;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffMime(bytes);
  if (!mimeType) return { error: "Upload a PDF, JPG, PNG or WebP file. Save Word resumes as PDF first." } as const;
  return { fileName: file.name.slice(0, 200) || "resume", mimeType, size: file.size, data: bytes } as const;
}

export async function createCandidate(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRecruiter();
  const parsed = candidateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const upload = await readUpload(formData);
  if (upload && "error" in upload) return { error: upload.error };
  if (!parsed.data.email && !parsed.data.phone) return { error: "Add an email or a phone number so you can reach them." };

  const candidate = await db.candidate.create({
    data: {
      ...parsed.data,
      createdById: user.id,
      ...(upload ? { files: { create: { kind: "Resume", ...upload, uploadedById: user.id } } } : {}),
    },
  });
  refresh(undefined, candidate.jobId);
  redirect(`/recruitment/candidates/${candidate.id}`);
}

export async function updateCandidate(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireRecruiter();
  const parsed = candidateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (!parsed.data.email && !parsed.data.phone) return { error: "Add an email or a phone number so you can reach them." };
  const before = await db.candidate.findUniqueOrThrow({ where: { id }, select: { jobId: true } });
  await db.candidate.update({ where: { id }, data: parsed.data });
  refresh(id, before.jobId);
  if (before.jobId !== parsed.data.jobId) revalidatePath(`/recruitment/jobs/${parsed.data.jobId}`);
  return { ok: "Saved." };
}

/** Manual stage moves. Offer and hire have their own steps, so they can't be picked here. */
export async function moveCandidate(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireRecruiter();
  const stage = z.enum(["APPLIED", "SCREENING", "INTERVIEW", "REJECTED", "WITHDRAWN"]).safeParse(formData.get("stage"));
  if (!stage.success) return { error: "Choose a stage." };
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const candidate = await db.candidate.findUniqueOrThrow({ where: { id } });
  if (candidate.stage === "HIRED") return { error: "This candidate is already hired." };
  const closing = stage.data === "REJECTED" || stage.data === "WITHDRAWN";
  if (closing && !reason) return { error: "Add a short reason, so the team knows later." };
  await db.$transaction([
    db.candidate.update({ where: { id }, data: { stage: stage.data, closedReason: closing ? reason : null } }),
    // A closed candidate doesn't keep interviews or a live offer hanging.
    ...(closing
      ? [
          db.interview.updateMany({ where: { candidateId: id, status: "SCHEDULED" }, data: { status: "CANCELLED" } }),
          db.offer.updateMany({
            where: { candidateId: id, status: { in: ["DRAFT", "SENT"] } },
            data: { status: stage.data === "WITHDRAWN" ? "DECLINED" : "WITHDRAWN", respondedAt: new Date() },
          }),
        ]
      : []),
  ]);
  refresh(id, candidate.jobId);
  return { ok: "Stage updated." };
}

export async function deleteCandidate(id: string) {
  await requireOfferMaker();
  const candidate = await db.candidate.findUniqueOrThrow({ where: { id } });
  if (candidate.employeeId) throw new Error("A hired candidate's record stays, as it links to their HR profile");
  await db.candidate.delete({ where: { id } });
  refresh(undefined, candidate.jobId);
  redirect(`/recruitment/jobs/${candidate.jobId}`);
}

export async function uploadCandidateFile(candidateId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRecruiter();
  const kind = z.enum(FILE_KINDS).safeParse(formData.get("kind"));
  if (!kind.success) return { error: "Choose what the file is." };
  const upload = await readUpload(formData);
  if (!upload) return { error: "Choose a file." };
  if ("error" in upload) return { error: upload.error };
  await db.candidateFile.create({ data: { candidateId, kind: kind.data, ...upload, uploadedById: user.id } });
  refresh(candidateId);
  return { ok: "Uploaded." };
}

export async function deleteCandidateFile(fileId: string) {
  await requireRecruiter();
  const file = await db.candidateFile.delete({ where: { id: fileId }, select: { candidateId: true } });
  refresh(file.candidateId);
}

// ─── Interviews ────────────────────────────────────────────────────────────

const interviewSchema = z.object({
  round: z.enum(INTERVIEW_ROUNDS),
  scheduledAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "pick a date and time")
    .transform(parseISTDateTime),
  mode: z.enum(INTERVIEW_MODES),
  location: optional,
  interviewerId: z.string().min(1, "choose who interviews"),
});

export async function scheduleInterview(candidateId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRecruiter();
  const parsed = interviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const candidate = await db.candidate.findUniqueOrThrow({ where: { id: candidateId } });
  if (!["APPLIED", "SCREENING", "INTERVIEW"].includes(candidate.stage)) {
    return { error: "Interviews can only be booked while the candidate is still in the running." };
  }
  const interviewer = await db.user.findUnique({ where: { id: parsed.data.interviewerId } });
  if (!interviewer?.active) return { error: "Choose an active team member to interview." };

  await db.$transaction([
    db.interview.create({ data: { ...parsed.data, candidateId, scheduledById: user.id } }),
    db.candidate.update({ where: { id: candidateId }, data: { stage: "INTERVIEW" } }),
  ]);
  refresh(candidateId, candidate.jobId);
  revalidatePath("/recruitment/interviews");
  return { ok: `Interview booked with ${interviewer.name}.` };
}

export async function setInterviewStatus(interviewId: string, formData: FormData) {
  await requireRecruiter();
  const status = z.enum(["CANCELLED", "NO_SHOW", "SCHEDULED"]).parse(formData.get("status"));
  const interview = await db.interview.update({ where: { id: interviewId }, data: { status } });
  refresh(interview.candidateId);
  revalidatePath("/recruitment/interviews");
}

const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1, "give a rating").max(5),
  recommendation: z.enum(["STRONG_YES", "YES", "NO", "STRONG_NO"], { message: "pick a recommendation" }),
  feedback: z.string().trim().min(10, "write a few lines on how it went"),
});

/** The interviewer records how it went. Admins can fill it in for someone. */
export async function submitFeedback(interviewId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const interview = await db.interview.findUniqueOrThrow({ where: { id: interviewId } });
  if (interview.interviewerId !== user.id && !canOffer(user)) return { error: "Only the interviewer can give this feedback." };
  if (interview.status === "CANCELLED") return { error: "This interview was cancelled." };
  const parsed = feedbackSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await db.interview.update({
    where: { id: interviewId },
    data: { ...parsed.data, status: "DONE", feedbackAt: new Date() },
  });
  refresh(interview.candidateId);
  revalidatePath("/recruitment/interviews");
  return { ok: "Feedback saved. Thank you." };
}

// ─── Offers ────────────────────────────────────────────────────────────────

const offerSchema = z.object({
  designation: z.string().trim().min(2, "required"),
  departmentId: optional,
  managerId: optional,
  employmentType,
  basic: z.coerce.number().positive("enter the monthly basic"),
  hra: z.coerce.number().min(0),
  specialAllowance: z.coerce.number().min(0),
  joiningDate: z.string().trim().min(1, "required").transform(parseDateOnly),
  respondBy: z
    .string()
    .trim()
    .transform((v) => (v ? parseDateOnly(v) : null)),
  probationMonths: z.coerce.number().int().min(0).max(24),
  notes: optional,
});

export async function createOffer(candidateId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireOfferMaker();
  const parsed = offerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const candidate = await db.candidate.findUniqueOrThrow({ where: { id: candidateId }, include: { offers: true } });
  if (["HIRED", "REJECTED", "WITHDRAWN"].includes(candidate.stage)) return { error: "This candidate is no longer in the running." };
  if (candidate.offers.some((o) => ["DRAFT", "SENT", "ACCEPTED"].includes(o.status))) {
    return { error: "There is already a live offer. Withdraw it before making a new one." };
  }
  await db.$transaction([
    db.offer.create({ data: { ...parsed.data, candidateId, createdById: user.id } }),
    db.candidate.update({ where: { id: candidateId }, data: { stage: "OFFER" } }),
  ]);
  refresh(candidateId, candidate.jobId);
  return { ok: "Offer drafted. Print the letter, then mark it sent." };
}

const NEXT_OFFER_STATUS = {
  DRAFT: ["SENT", "WITHDRAWN"],
  SENT: ["ACCEPTED", "DECLINED", "WITHDRAWN"],
  ACCEPTED: ["WITHDRAWN"],
  DECLINED: [],
  WITHDRAWN: [],
} as const;

export async function setOfferStatus(offerId: string, formData: FormData) {
  await requireOfferMaker();
  const status = z.enum(["SENT", "ACCEPTED", "DECLINED", "WITHDRAWN"]).parse(formData.get("status"));
  const offer = await db.offer.findUniqueOrThrow({ where: { id: offerId }, include: { candidate: true } });
  if (!(NEXT_OFFER_STATUS[offer.status] as readonly string[]).includes(status)) throw new Error("That change isn't allowed");
  if (offer.candidate.stage === "HIRED") throw new Error("The candidate is already hired");
  const now = new Date();
  await db.$transaction([
    db.offer.update({
      where: { id: offerId },
      data: { status, ...(status === "SENT" ? { sentAt: now } : { respondedAt: now }) },
    }),
    // A declined offer closes the candidate; a withdrawn one puts them back to interviewing.
    ...(status === "DECLINED"
      ? [db.candidate.update({ where: { id: offer.candidateId }, data: { stage: "WITHDRAWN", closedReason: "Declined the offer" } })]
      : status === "WITHDRAWN"
        ? [db.candidate.update({ where: { id: offer.candidateId }, data: { stage: "INTERVIEW" } })]
        : []),
  ]);
  refresh(offer.candidateId, offer.candidate.jobId);
}

// ─── Hire: move into HR ────────────────────────────────────────────────────

const hireSchema = z.object({
  code: z.string().trim().min(1, "required"),
  firstName: z.string().trim().min(1, "required"),
  lastName: z.string().trim().min(1, "required"),
  workEmail: z.string().trim().toLowerCase().email(),
});

/**
 * Creates the employee from the accepted offer: status Onboarding with the standard
 * joining checklist, salary from the offer, and the candidate's files as documents.
 */
export async function hireCandidate(candidateId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user: CurrentUser = await requireOfferMaker();
  const parsed = hireSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const withLogin = formData.get("withLogin") === "on";
  const password = String(formData.get("password") ?? "");
  const role = z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]).catch("EMPLOYEE").parse(formData.get("role"));
  if (withLogin && password.length < 8) return { error: "Temporary password must be at least 8 characters." };

  const candidate = await db.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { offers: { where: { status: "ACCEPTED" } }, files: true },
  });
  if (candidate.employeeId) return { error: "This candidate is already in HR." };
  const offer = candidate.offers[0];
  if (!offer) return { error: "Mark the offer as accepted first." };

  const passwordHash = withLogin ? await hashPassword(password) : null;
  let employeeId: string;
  try {
    employeeId = await db.$transaction(async (tx) => {
      const login = passwordHash
        ? await tx.user.create({
            data: { email: parsed.data.workEmail, name: `${parsed.data.firstName} ${parsed.data.lastName}`, passwordHash, role },
          })
        : null;
      const employee = await tx.employee.create({
        data: {
          ...parsed.data,
          personalEmail: candidate.email,
          phone: candidate.phone,
          city: candidate.city,
          designation: offer.designation,
          departmentId: offer.departmentId,
          managerId: offer.managerId,
          employmentType: offer.employmentType,
          status: "ONBOARDING",
          dateOfJoining: offer.joiningDate,
          userId: login?.id,
        },
      });
      await tx.onboardingTask.createMany({ data: checklistRows(employee.id, employee.dateOfJoining) });
      await tx.salaryStructure.create({
        data: {
          employeeId: employee.id,
          effectiveFrom: offer.joiningDate,
          basic: offer.basic,
          hra: offer.hra,
          specialAllowance: offer.specialAllowance,
          note: "From the accepted offer",
        },
      });
      if (candidate.files.length > 0) {
        await tx.employeeDocument.createMany({
          data: candidate.files.map((f) => ({
            employeeId: employee.id,
            type: f.kind === "Resume" ? "Resume" : "Other",
            fileName: f.fileName,
            mimeType: f.mimeType,
            size: f.size,
            data: f.data,
            status: "VERIFIED" as const,
            uploadedById: f.uploadedById,
            reviewedById: user.id,
            reviewedAt: new Date(),
          })),
        });
      }
      await tx.candidate.update({ where: { id: candidateId }, data: { stage: "HIRED", employeeId: employee.id } });

      // The opening is filled once it has as many hires as positions.
      const job = await tx.jobOpening.findUniqueOrThrow({ where: { id: candidate.jobId } });
      const hires = await tx.candidate.count({ where: { jobId: job.id, stage: "HIRED" } });
      if (hires >= job.positions && job.status === "OPEN") {
        await tx.jobOpening.update({ where: { id: job.id }, data: { status: "FILLED", closedAt: new Date() } });
      }
      return employee.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined)?.join(", ") ?? "field";
      return { error: `That ${target} is already in use.` };
    }
    throw e;
  }
  refresh(candidateId, candidate.jobId);
  revalidatePath("/hr/employees");
  revalidatePath("/hr/onboarding");
  redirect(`/hr/employees/${employeeId}`);
}
