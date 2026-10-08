"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import type { FormState } from "@/components/action-form";
import { logActivity } from "@/lib/activity";

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : parseDateOnly(v)))
  .nullable()
  .optional();
const orgType = z.enum(["SCHOOL", "COLLEGE", "UNIVERSITY", "CORPORATE", "GOVERNMENT", "NGO", "PARTNER", "OTHER"]);
const dealStage = z.enum(["PROSPECT", "DEMO", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]);

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return `${issue.path.join(".") || "Form"}: ${issue.message}`;
}

function refresh() {
  revalidatePath("/crm", "layout");
  revalidatePath("/");
}

async function requireAdminToDelete() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Only admins can delete CRM records");
  return user;
}

// ─── Leads ─────────────────────────────────────────────────────────────────

const leadSchema = z.object({
  name: z.string().trim().min(1, "required"),
  organizationName: optional,
  orgType: orgType.or(z.literal("").transform(() => null)).optional(),
  email: optional,
  phone: optional,
  city: optional,
  interest: optional,
  source: z.enum(["WEBSITE", "REFERRAL", "WALK_IN", "PHONE", "EMAIL", "SOCIAL", "EVENT", "OTHER"]),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"]).optional(),
  ownerId: optional,
  notes: optional,
});

export async function createLead(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const lead = await db.lead.create({ data: { ...parsed.data, ownerId: parsed.data.ownerId ?? user.id } });
  refresh();
  redirect(`/crm/leads/${lead.id}`);
}

export async function updateLead(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return { error: "Lead not found." };
  // A converted lead keeps its status; everything else can be edited.
  const data = lead.status === "CONVERTED" ? { ...parsed.data, status: undefined } : parsed.data;
  await db.lead.update({ where: { id }, data });
  refresh();
  return { ok: "Saved." };
}

export async function deleteLead(id: string) {
  const admin = await requireAdminToDelete();
  const lead = await db.lead.delete({ where: { id } });
  await logActivity(admin, "DELETED", "lead.deleted", `Deleted lead ${lead.name}`);
  refresh();
  redirect("/crm/leads");
}

/** Turn a lead into an institution (new or existing), a contact and an open deal. */
export async function convertLead(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({
      organizationId: optional,
      organizationName: optional,
      orgType: orgType,
      dealTitle: z.string().trim().min(1, "required"),
      value: z.coerce.number().min(0),
      program: optional,
      expectedClose: optionalDate,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const input = parsed.data;

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return { error: "Lead not found." };
  if (lead.status === "CONVERTED") return { error: "This lead was already converted." };
  if (!input.organizationId && !input.organizationName) return { error: "Pick an institution or enter a new one." };

  const ownerId = lead.ownerId ?? user.id;
  const dealId = await db.$transaction(async (tx) => {
    const orgId =
      input.organizationId ??
      (
        await tx.organization.create({
          data: { name: input.organizationName!, type: input.orgType, city: lead.city, ownerId },
        })
      ).id;
    const contact = await tx.contact.create({
      data: { name: lead.name, email: lead.email, phone: lead.phone, organizationId: orgId, ownerId },
    });
    const deal = await tx.deal.create({
      data: {
        title: input.dealTitle,
        value: input.value,
        program: input.program ?? lead.interest,
        expectedClose: input.expectedClose,
        organizationId: orgId,
        contactId: contact.id,
        ownerId,
        notes: [lead.interest, lead.notes].filter(Boolean).join("\n\n") || null,
      },
    });
    await tx.lead.update({ where: { id }, data: { status: "CONVERTED", convertedDealId: deal.id } });
    // Keep the lead's history visible on the deal.
    await tx.activity.updateMany({ where: { leadId: id }, data: { dealId: deal.id, organizationId: orgId } });
    return deal.id;
  });
  refresh();
  redirect(`/crm/deals/${dealId}`);
}

// ─── Organizations ─────────────────────────────────────────────────────────

const orgSchema = z.object({
  name: z.string().trim().min(1, "required"),
  type: orgType,
  board: optional,
  phone: optional,
  email: optional,
  website: optional,
  address: optional,
  city: optional,
  district: optional,
  state: optional,
  gstin: optional.transform((v) => v?.toUpperCase() ?? null),
  ownerId: optional,
  notes: optional,
});

export async function createOrganization(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = orgSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const org = await db.organization.create({ data: { ...parsed.data, ownerId: parsed.data.ownerId ?? user.id } });
  refresh();
  redirect(`/crm/organizations/${org.id}`);
}

export async function updateOrganization(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = orgSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await db.organization.update({ where: { id }, data: parsed.data });
  refresh();
  return { ok: "Saved." };
}

export async function deleteOrganization(id: string) {
  const user = await requireAdminToDelete();
  // School programmes keep their session history, so they block deleting the school.
  if (await db.programme.count({ where: { organizationId: id } }))
    throw new Error("This institution has school programmes. Delete those first under Operations.");
  // Invoices are tax records, so a billed institution stays.
  if (await db.invoice.count({ where: { organizationId: id } }))
    throw new Error("This institution has invoices, so it can't be deleted.");
  const org = await db.organization.delete({ where: { id } });
  await logActivity(user, "DELETED", "institution.deleted", `Deleted institution ${org.name}`);
  refresh();
  redirect("/crm/organizations");
}

// ─── Contacts ──────────────────────────────────────────────────────────────

const contactSchema = z.object({
  name: z.string().trim().min(1, "required"),
  designation: optional,
  email: optional,
  phone: optional,
  organizationId: optional,
  ownerId: optional,
  notes: optional,
});

export async function createContact(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await db.contact.create({ data: { ...parsed.data, ownerId: parsed.data.ownerId ?? user.id } });
  refresh();
  return { ok: `Added ${parsed.data.name}.` };
}

export async function updateContact(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await db.contact.update({ where: { id }, data: parsed.data });
  refresh();
  return { ok: "Saved." };
}

export async function deleteContact(id: string) {
  const admin = await requireAdminToDelete();
  const contact = await db.contact.delete({ where: { id } });
  await logActivity(admin, "DELETED", "contact.deleted", `Deleted contact ${contact.name}`);
  refresh();
  redirect("/crm/contacts");
}

// ─── Deals ─────────────────────────────────────────────────────────────────

const dealSchema = z.object({
  title: z.string().trim().min(1, "required"),
  value: z.coerce.number().min(0),
  stage: dealStage,
  program: optional,
  students: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(0).nullable())
    .optional(),
  expectedClose: optionalDate,
  organizationId: optional,
  contactId: optional,
  ownerId: optional,
  lostReason: optional,
  notes: optional,
});

function closedAtFor(stage: string, previous?: { stage: string; closedAt: Date | null }) {
  if (stage !== "WON" && stage !== "LOST") return null;
  return previous && previous.stage === stage ? previous.closedAt : new Date();
}

export async function createDeal(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = dealSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const deal = await db.deal.create({
    data: { ...parsed.data, ownerId: parsed.data.ownerId ?? user.id, closedAt: closedAtFor(parsed.data.stage) },
  });
  refresh();
  redirect(`/crm/deals/${deal.id}`);
}

export async function updateDeal(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = dealSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const previous = await db.deal.findUnique({ where: { id } });
  if (!previous) return { error: "Deal not found." };
  await db.deal.update({ where: { id }, data: { ...parsed.data, closedAt: closedAtFor(parsed.data.stage, previous) } });
  refresh();
  return { ok: "Saved." };
}

export async function moveDeal(id: string, formData: FormData) {
  await requireUser();
  const stage = dealStage.parse(formData.get("stage"));
  const previous = await db.deal.findUnique({ where: { id } });
  if (!previous) return;
  await db.deal.update({ where: { id }, data: { stage, closedAt: closedAtFor(stage, previous) } });
  refresh();
}

export async function deleteDeal(id: string) {
  const admin = await requireAdminToDelete();
  const deal = await db.deal.delete({ where: { id } });
  await logActivity(admin, "DELETED", "deal.deleted", `Deleted deal ${deal.title}`);
  refresh();
  redirect("/crm/deals");
}

// ─── Activities (calls, visits, follow-ups) ────────────────────────────────

const activitySchema = z.object({
  type: z.enum(["CALL", "MEETING", "EMAIL", "VISIT", "TASK", "NOTE"]),
  subject: z.string().trim().min(1, "required"),
  body: optional,
  dueAt: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : new Date(`${v}:00+05:30`))) // datetime-local, entered in IST
    .nullable()
    .optional(),
  assigneeId: optional,
  leadId: optional,
  dealId: optional,
  organizationId: optional,
  contactId: optional,
});

export async function createActivity(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = activitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const data = parsed.data;
  if (data.dueAt && Number.isNaN(data.dueAt.getTime())) return { error: "Invalid due date." };
  // Notes and logged calls/emails without a due date are history, so they're done already.
  const done = !data.dueAt && data.type !== "TASK";
  await db.activity.create({
    data: { ...data, assigneeId: data.assigneeId ?? user.id, createdById: user.id, done },
  });
  refresh();
  return { ok: done ? "Logged." : "Follow-up scheduled." };
}

export async function toggleActivity(id: string) {
  await requireUser();
  const a = await db.activity.findUnique({ where: { id } });
  if (!a) return;
  await db.activity.update({ where: { id }, data: { done: !a.done } });
  refresh();
}
