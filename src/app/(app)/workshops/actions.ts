"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isAdmin, type CurrentUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/time";
import { PAYMENT_METHODS, financialYear } from "@/lib/invoices";
import {
  CERTIFICATE_TITLES,
  WORKSHOP_AUDIENCES,
  WORKSHOP_FEE_TYPES,
  WORKSHOP_MODES,
  WORKSHOP_STATUSES,
  canManageWorkshop,
  canMarkAttendance,
  certificateNumber,
  parsePastedRegistrations,
  standing,
  workshopDays,
} from "@/lib/workshops";
import type { FormState } from "@/components/action-form";

const optional = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => v || null);

const date = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date")
  .transform(parseDateOnly);

const money = z.coerce.number().min(0, "can't be negative").max(1e8);

function refresh(workshopId?: string) {
  revalidatePath("/workshops", "layout");
  if (workshopId) revalidatePath(`/workshops/${workshopId}`, "layout");
}

async function workshopFor(user: CurrentUser, id: string, need: "manage" | "attendance" = "manage") {
  const w = await db.workshop.findUnique({ where: { id }, include: { trainers: { select: { userId: true } } } });
  if (!w) throw new Error("Workshop not found");
  const ok = need === "manage" ? canManageWorkshop(user, w) : canMarkAttendance(user, w);
  if (!ok) throw new Error("Only whoever runs this workshop can change it.");
  return w;
}

// ─── Workshops ─────────────────────────────────────────────────────────────

const workshopSchema = z.object({
  title: z.string().trim().min(1, "give it a title").max(200),
  description: optional,
  audience: z.enum(WORKSHOP_AUDIENCES),
  mode: z.enum(WORKSHOP_MODES),
  venue: optional,
  organizationId: optional,
  startDate: date,
  endDate: z
    .string()
    .trim()
    .transform((v) => (v ? parseDateOnly(v) : null)),
  hours: z
    .string()
    .trim()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0 && v <= 1000), "hours must be a number"),
  capacity: z
    .string()
    .trim()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v <= 100000), "capacity must be a whole number"),
  feeType: z.enum(WORKSHOP_FEE_TYPES),
  fee: money.optional().default(0),
  coordinatorId: z.string().min(1, "pick a coordinator"),
  certificateTitle: z.enum(CERTIFICATE_TITLES),
  minAttendancePct: z.coerce.number().int().min(1).max(100),
  certNeedsPayment: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  notes: optional,
});

function readWorkshop(formData: FormData) {
  const parsed = workshopSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `${i.path.join(" ") || "Form"}: ${i.message}` } as const;
  }
  const d = parsed.data;
  const endDate = d.endDate ?? d.startDate;
  if (endDate < d.startDate) return { error: "The last day is before the first day." } as const;
  if (workshopDays({ startDate: d.startDate, endDate }).length >= 60) return { error: "A workshop can run for at most 60 days." } as const;
  if (d.feeType === "PER_PERSON" && d.fee <= 0) return { error: "Enter the fee each participant pays, or pick Free." } as const;
  return {
    data: { ...d, endDate, fee: d.feeType === "PER_PERSON" ? d.fee : 0, certNeedsPayment: d.feeType === "PER_PERSON" && d.certNeedsPayment },
  } as const;
}

export async function createWorkshop(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const form = readWorkshop(formData);
  if ("error" in form) return { error: form.error };
  const trainerIds = formData.getAll("trainerIds").map(String).filter(Boolean);
  const w = await db.workshop.create({
    data: {
      ...form.data,
      createdById: user.id,
      trainers: { create: [...new Set(trainerIds)].map((userId) => ({ userId })) },
    },
  });
  refresh();
  redirect(`/workshops/${w.id}`);
}

export async function updateWorkshop(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const w = await workshopFor(user, id);
  const form = readWorkshop(formData);
  if ("error" in form) return { error: form.error };
  // Attendance marked on days the new dates no longer cover would quietly stop counting: say so instead.
  const outside = await db.workshopAttendance.count({
    where: { registration: { workshopId: id }, OR: [{ date: { lt: form.data.startDate } }, { date: { gt: form.data.endDate } }] },
  });
  if (outside) return { error: "Attendance is already marked on days outside the new dates. Clear it on those days first." };
  // A new per-person fee applies to people who still owe the old one; discounts and waivers stay.
  const feeChanged = w.feeType === "PER_PERSON" && form.data.feeType === "PER_PERSON" && Number(w.fee) !== form.data.fee;
  await db.$transaction([
    db.workshop.update({ where: { id }, data: form.data }),
    ...(feeChanged ? [db.workshopRegistration.updateMany({ where: { workshopId: id, fee: w.fee }, data: { fee: form.data.fee } })] : []),
    ...(w.feeType !== "PER_PERSON" && form.data.feeType === "PER_PERSON"
      ? [db.workshopRegistration.updateMany({ where: { workshopId: id, fee: 0 }, data: { fee: form.data.fee } })]
      : []),
  ]);
  refresh(id);
  return { ok: "Saved." };
}

export async function setWorkshopStatus(id: string, formData: FormData) {
  const user = await requireUser();
  await workshopFor(user, id);
  const status = z.enum(WORKSHOP_STATUSES).parse(formData.get("status"));
  await db.workshop.update({ where: { id }, data: { status } });
  refresh(id);
}

export async function deleteWorkshop(id: string) {
  const user = await requireUser();
  await workshopFor(user, id);
  const regs = await db.workshopRegistration.count({ where: { workshopId: id } });
  if (regs) throw new Error("This workshop has registrations. Mark it cancelled instead.");
  await db.workshop.delete({ where: { id } });
  refresh();
  redirect("/workshops");
}

export async function addTrainer(id: string, formData: FormData) {
  const user = await requireUser();
  await workshopFor(user, id);
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  await db.workshopTrainer.upsert({ where: { workshopId_userId: { workshopId: id, userId } }, update: {}, create: { workshopId: id, userId } });
  refresh(id);
}

export async function removeTrainer(id: string, userId: string) {
  const user = await requireUser();
  await workshopFor(user, id);
  await db.workshopTrainer.deleteMany({ where: { workshopId: id, userId } });
  refresh(id);
}

// ─── Registrations ─────────────────────────────────────────────────────────

const personSchema = z.object({
  name: z.string().trim().min(1, "enter the participant's name").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.email().safeParse(v).success, "that isn't an email address")
    .transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((v) => v || null),
  institution: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  detail: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
});

async function seatsLeft(w: { id: string; capacity: number | null }) {
  if (!w.capacity) return Infinity;
  const taken = await db.workshopRegistration.count({ where: { workshopId: w.id, status: "REGISTERED" } });
  return w.capacity - taken;
}

export async function addRegistration(workshopId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const w = await workshopFor(user, workshopId);
  if (w.status === "CANCELLED") return { error: "This workshop is cancelled." };
  const parsed = personSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if ((await seatsLeft(w)) <= 0) return { error: `The workshop is full (${w.capacity} places). Raise the capacity to add more.` };
  if (parsed.data.email) {
    const dup = await db.workshopRegistration.findFirst({ where: { workshopId, email: parsed.data.email, status: "REGISTERED" } });
    if (dup) return { error: `${dup.name} is already registered with ${parsed.data.email}.` };
  }
  await db.workshopRegistration.create({
    data: { workshopId, ...parsed.data, fee: w.feeType === "PER_PERSON" ? w.fee : 0, addedById: user.id },
  });
  refresh(workshopId);
  return { ok: `${parsed.data.name} registered.` };
}

/** Many people at once, pasted from a spreadsheet or a Google Form's responses sheet. */
export async function pasteRegistrations(workshopId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const w = await workshopFor(user, workshopId);
  if (w.status === "CANCELLED") return { error: "This workshop is cancelled." };
  const { rows, skipped } = parsePastedRegistrations(String(formData.get("pasted") ?? ""));
  if (rows.length === 0) return { error: "Nothing to add. Paste one person per line: name, email, phone, college or company, course or designation." };
  if (rows.length > 1000) return { error: "Paste at most 1,000 people at a time." };
  const existing = new Set(
    (await db.workshopRegistration.findMany({ where: { workshopId, status: "REGISTERED", email: { not: null } }, select: { email: true } })).map(
      (r) => r.email,
    ),
  );
  const fresh = rows.filter((r) => !r.email || !existing.has(r.email));
  const seen = new Set<string>();
  const unique = fresh.filter((r) => !r.email || (!seen.has(r.email) && seen.add(r.email)));
  const room = await seatsLeft(w);
  if (unique.length > room) return { error: `Only ${room} place${room === 1 ? "" : "s"} left, and the list has ${unique.length} new people. Raise the capacity first.` };
  await db.workshopRegistration.createMany({
    data: unique.map((r) => ({ workshopId, ...r, fee: w.feeType === "PER_PERSON" ? w.fee : 0, addedById: user.id })),
  });
  refresh(workshopId);
  const dupes = rows.length - unique.length;
  const notes = [dupes && `${dupes} already registered`, skipped.length && `${skipped.length} line${skipped.length === 1 ? "" : "s"} without a name skipped`]
    .filter(Boolean)
    .join(", ");
  return { ok: `Added ${unique.length} ${unique.length === 1 ? "person" : "people"}.${notes ? ` (${notes})` : ""}` };
}

async function registrationFor(user: CurrentUser, id: string) {
  const r = await db.workshopRegistration.findUnique({ where: { id } });
  if (!r) throw new Error("Registration not found");
  const w = await workshopFor(user, r.workshopId);
  return { r, w };
}

export async function updateRegistration(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { r, w } = await registrationFor(user, id);
  const parsed = personSchema.extend({ fee: money.optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { fee, ...person } = parsed.data;
  await db.workshopRegistration.update({
    where: { id },
    data: { ...person, ...(w.feeType === "PER_PERSON" && fee !== undefined ? { fee } : {}) },
  });
  refresh(r.workshopId);
  revalidatePath(`/workshops/registrations/${id}`);
  const renamed = person.name !== r.name && (await db.workshopCertificate.count({ where: { registrationId: id } })) > 0;
  return { ok: renamed ? "Saved. The certificate shows the new name and keeps its number." : "Saved." };
}

export async function setRegistrationStatus(id: string, cancelled: boolean) {
  const user = await requireUser();
  const { r, w } = await registrationFor(user, id);
  if (!cancelled && (await seatsLeft(w)) <= 0) throw new Error("The workshop is full.");
  const cert = await db.workshopCertificate.findUnique({ where: { registrationId: id } });
  if (cancelled && cert?.status === "ISSUED") throw new Error("Cancel the certificate first.");
  await db.workshopRegistration.update({
    where: { id },
    data: { status: cancelled ? "CANCELLED" : "REGISTERED", cancelledAt: cancelled ? new Date() : null },
  });
  refresh(r.workshopId);
  revalidatePath(`/workshops/registrations/${id}`);
}

/** Only for someone added by mistake: no payments, attendance or certificate yet. */
export async function deleteRegistration(id: string) {
  const user = await requireUser();
  const { r } = await registrationFor(user, id);
  const [payments, marks, cert] = await Promise.all([
    db.workshopPayment.count({ where: { registrationId: id } }),
    db.workshopAttendance.count({ where: { registrationId: id } }),
    db.workshopCertificate.count({ where: { registrationId: id } }),
  ]);
  if (payments || marks || cert) throw new Error("This person has payments, attendance or a certificate. Cancel the registration instead.");
  await db.workshopRegistration.delete({ where: { id } });
  refresh(r.workshopId);
  redirect(`/workshops/${r.workshopId}`);
}

// ─── Fees ──────────────────────────────────────────────────────────────────

const paymentSchema = z.object({
  amount: z.coerce.number().positive("enter the amount received").max(1e8),
  paidOn: date,
  method: z.enum(PAYMENT_METHODS),
  reference: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
});

export async function recordPayment(registrationId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const { r, w } = await registrationFor(user, registrationId);
  if (w.feeType !== "PER_PERSON") return { error: "Participants don't pay for this workshop." };
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.paidOn > todayIST()) return { error: "The payment date is in the future." };
  const paid = Number((await db.workshopPayment.aggregate({ where: { registrationId }, _sum: { amount: true } }))._sum.amount ?? 0);
  const due = Math.round((Number(r.fee) - paid) * 100) / 100;
  if (parsed.data.amount > due + 0.005) return { error: due > 0 ? `Only ${due.toFixed(2)} is due from ${r.name}.` : `${r.name} has already paid in full.` };
  await db.workshopPayment.create({ data: { registrationId, ...parsed.data, recordedById: user.id } });
  refresh(r.workshopId);
  revalidatePath(`/workshops/registrations/${registrationId}`);
  return { ok: "Payment recorded." };
}

/** The quick "Paid in full" button on the registrations list. */
export async function markPaidInFull(registrationId: string, formData: FormData) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const { r, w } = await registrationFor(user, registrationId);
  if (w.feeType !== "PER_PERSON") return;
  const paid = Number((await db.workshopPayment.aggregate({ where: { registrationId }, _sum: { amount: true } }))._sum.amount ?? 0);
  const due = Math.round((Number(r.fee) - paid) * 100) / 100;
  if (due <= 0) return;
  const method = z.enum(PAYMENT_METHODS).catch("UPI").parse(formData.get("method"));
  await db.workshopPayment.create({ data: { registrationId, amount: due, paidOn: todayIST(), method, recordedById: user.id } });
  refresh(r.workshopId);
}

export async function removePayment(paymentId: string) {
  const user = await requireUser(["ADMIN"]);
  const p = await db.workshopPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { registration: true } });
  await registrationFor(user, p.registrationId);
  await db.workshopPayment.delete({ where: { id: paymentId } });
  refresh(p.registration.workshopId);
  revalidatePath(`/workshops/registrations/${p.registrationId}`);
}

// ─── Attendance ────────────────────────────────────────────────────────────

/** Saves one day's register: ticked people present, everyone else on the list absent. */
export async function saveAttendance(workshopId: string, day: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const w = await workshopFor(user, workshopId, "attendance");
  const d = parseDateOnly(day);
  if (!workshopDays(w).some((x) => x.getTime() === d.getTime())) return { error: "That isn't one of the workshop's days." };
  if (d > todayIST()) return { error: "This day hasn't come yet." };
  const present = new Set(formData.getAll("present").map(String));
  const regs = await db.workshopRegistration.findMany({ where: { workshopId, status: "REGISTERED" }, select: { id: true } });
  await db.$transaction(
    regs.map((r) =>
      db.workshopAttendance.upsert({
        where: { registrationId_date: { registrationId: r.id, date: d } },
        update: { present: present.has(r.id) },
        create: { registrationId: r.id, date: d, present: present.has(r.id) },
      }),
    ),
  );
  refresh(workshopId);
  return { ok: `Saved: ${present.size} present, ${regs.length - present.size} absent.` };
}

// ─── Certificates ──────────────────────────────────────────────────────────

/** Number and issue certificates, in name order, for everyone who has earned one and doesn't have one yet. */
async function issue(workshopId: string, registrationIds: string[] | null, userId: string) {
  const w = await db.workshop.findUniqueOrThrow({ where: { id: workshopId } });
  const today = todayIST();
  const regs = await db.workshopRegistration.findMany({
    where: { workshopId, certificate: null, ...(registrationIds ? { id: { in: registrationIds } } : {}) },
    include: { payments: { select: { amount: true } }, attendance: { select: { present: true } } },
    orderBy: { name: "asc" },
  });
  const eligible = regs.filter((r) => !standing(w, r, today).blocker);
  if (eligible.length === 0) return 0;
  const settings = await getSettings();
  const fy = financialYear(today);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.$transaction(async (tx) => {
        const last = await tx.workshopCertificate.aggregate({ where: { fy }, _max: { seq: true } });
        let seq = last._max.seq ?? 0;
        for (const r of eligible) {
          seq += 1;
          await tx.workshopCertificate.create({
            data: { registrationId: r.id, fy, seq, number: certificateNumber(settings.invoicePrefix, fy, seq), issuedOn: today, issuedById: userId },
          });
        }
      });
      break;
    } catch (e) {
      // Someone else issued certificates at the same moment and took the numbers: try again.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
  return eligible.length;
}

export async function issueCertificates(workshopId: string): Promise<FormState> {
  const user = await requireUser();
  await workshopFor(user, workshopId);
  const n = await issue(workshopId, null, user.id);
  refresh(workshopId);
  return n ? { ok: `Issued ${n} certificate${n === 1 ? "" : "s"}.` } : { error: "Nobody else has earned a certificate yet. See the reason next to each name." };
}

export async function issueCertificate(registrationId: string) {
  const user = await requireUser();
  const { r } = await registrationFor(user, registrationId);
  await issue(r.workshopId, [registrationId], user.id);
  refresh(r.workshopId);
  revalidatePath(`/workshops/registrations/${registrationId}`);
}

/** Withdraw a certificate issued by mistake. Its number stays used and it can't be reissued to the same registration. */
export async function cancelCertificate(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isAdmin(user)) return { error: "Only an admin can cancel a certificate." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why it's being cancelled." };
  const cert = await db.workshopCertificate.findUnique({ where: { id }, include: { registration: true } });
  if (!cert || cert.status !== "ISSUED") return { error: "Only an issued certificate can be cancelled." };
  await db.workshopCertificate.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.slice(0, 300) } });
  refresh(cert.registration.workshopId);
  revalidatePath(`/workshops/registrations/${cert.registrationId}`);
  return { ok: "Certificate cancelled." };
}
