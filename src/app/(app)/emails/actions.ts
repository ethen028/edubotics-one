"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { mailSetup, MAIL_NOT_READY, parseAddresses, sendEmail, type Attachment } from "@/lib/mail";
import { creditNotePdf, invoicePdf, payslipPdf, quotePdf } from "@/lib/pdf";
import { markQuoteSent } from "@/lib/quote-send";
import { calendarInvite } from "@/lib/ics";
import { canRecruit } from "@/lib/recruitment";
import { settledAmount } from "@/lib/invoices";
import { invoiceMoney } from "@/lib/credit-notes";
import { monthLabel } from "@/lib/payroll";
import { todayIST } from "@/lib/time";
import { payslipEmail, reminderEmail } from "@/lib/email-templates";
import type { FormState } from "@/components/action-form";

// Every email here goes out because someone pressed Send. Each one is recorded in the email history.

const composer = z.object({
  subject: z.string().trim().min(1, "Enter a subject.").max(200),
  message: z.string().trim().min(1, "Write a message.").max(5000),
});

/** To, copy to, subject and message from the email form. */
function readComposer(formData: FormData) {
  const to = parseAddresses(formData.get("to") as string, { required: true });
  if ("error" in to) return { error: to.error };
  const cc = parseAddresses(formData.get("cc") as string, { required: false });
  if ("error" in cc) return { error: cc.error };
  const parsed = composer.safeParse({ subject: formData.get("subject"), message: formData.get("message") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return { to: to.list, cc: cc.list, ...parsed.data };
}

async function readySettings() {
  const settings = await getSettings();
  const setup = mailSetup(settings);
  return setup === "READY" ? { settings } : { error: MAIL_NOT_READY[setup] };
}

const sentTo = (to: string[]) => `Sent to ${to.join(", ")}.`;

// ─── Invoices ──────────────────────────────────────────────────────────────

/** Email an issued invoice, or a payment reminder for it, with the invoice PDF attached. */
export async function emailInvoice(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const ready = await readySettings();
  if ("error" in ready) return { error: ready.error };
  const form = readComposer(formData);
  if ("error" in form) return { error: form.error };
  const kind = z.enum(["INVOICE", "PAYMENT_REMINDER"]).catch("INVOICE").parse(formData.get("kind"));
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice || invoice.status !== "ISSUED") return { error: "Only an issued invoice can be emailed." };
  const pdf = (await invoicePdf(id))!;
  const result = await sendEmail({ kind, ...form, attachments: [pdf], links: { invoiceIds: [id] } }, ready.settings, user.id);
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices/dues");
  return "error" in result ? { error: result.error } : { ok: sentTo(form.to) };
}

/**
 * One reminder to a school for all its overdue invoices, from the Payments due page.
 * Goes to the invoice contact's email, else the school's.
 */
export async function remindSchool(organizationId: string): Promise<FormState> {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const ready = await readySettings();
  if ("error" in ready) return { error: ready.error };
  const today = todayIST();
  const [org, invoices] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { email: true } }),
    db.invoice.findMany({
      where: { organizationId, status: "ISSUED", dueDate: { lt: today } },
      include: { payments: true, creditNotes: true, contact: { select: { name: true, email: true } } },
      orderBy: { dueDate: "asc" },
    }),
  ]);
  const overdue = invoices
    .map((i) => ({ ...i, number: i.number!, balance: invoiceMoney(i.total, settledAmount(i.payments), i.creditNotes).balance }))
    .filter((i) => i.balance > 0)
    .map((i) => ({ ...i, daysLate: Math.round((today.getTime() - i.dueDate.getTime()) / 86400000) }));
  if (overdue.length === 0) return { error: "Nothing from this school is overdue now." };
  const contact = overdue.find((i) => i.contact?.email)?.contact ?? null;
  const to = contact?.email ?? org.email;
  if (!to) return { error: "There's no email address for this school or its invoice contact. Add one in CRM first." };
  const draft = reminderEmail(overdue, contact?.name ?? null, user.name, ready.settings);
  const attachments = (await Promise.all(overdue.map((i) => invoicePdf(i.id)))).filter((a): a is Attachment => !!a);
  const result = await sendEmail(
    { kind: "PAYMENT_REMINDER", to: [to], ...draft, attachments, links: { invoiceIds: overdue.map((i) => i.id) } },
    ready.settings,
    user.id,
  );
  revalidatePath("/invoices", "layout");
  return "error" in result ? { error: result.error } : { ok: `Reminder sent to ${to}.` };
}

// ─── Credit notes ──────────────────────────────────────────────────────────

/** Email a credit note to the school with its PDF. */
export async function emailCreditNote(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const ready = await readySettings();
  if ("error" in ready) return { error: ready.error };
  const form = readComposer(formData);
  if ("error" in form) return { error: form.error };
  const note = await db.creditNote.findUnique({ where: { id } });
  if (!note || note.status !== "ISSUED") return { error: "Only an issued credit note can be emailed." };
  const pdf = (await creditNotePdf(id))!;
  const result = await sendEmail({ kind: "CREDIT_NOTE", ...form, attachments: [pdf], links: { creditNoteId: id } }, ready.settings, user.id);
  revalidatePath(`/credit-notes/${id}`);
  return "error" in result ? { error: result.error } : { ok: sentTo(form.to) };
}

// ─── Quotes ────────────────────────────────────────────────────────────────

/** Email a quote with its PDF. A draft is numbered and marked sent first, as "Mark as sent" does. */
export async function emailQuote(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const ready = await readySettings();
  if ("error" in ready) return { error: ready.error };
  const form = readComposer(formData);
  if ("error" in form) return { error: form.error };
  const quote = await db.quote.findUnique({ where: { id } });
  if (!quote || !["DRAFT", "SENT", "ACCEPTED"].includes(quote.status)) return { error: "This quote can't be emailed." };

  let subject = form.subject;
  let message = form.message;
  if (quote.status === "DRAFT") {
    await markQuoteSent(id, user.id);
    // The template said "Given when sent"; put the new number in wherever the draft had a placeholder.
    const sent = await db.quote.findUniqueOrThrow({ where: { id } });
    subject = subject.replaceAll("(number given when sent)", sent.number!);
    message = message.replaceAll("(number given when sent)", sent.number!);
  }
  const pdf = (await quotePdf(id))!;
  const result = await sendEmail({ kind: "QUOTE", ...form, subject, message, attachments: [pdf], links: { quoteId: id } }, ready.settings, user.id);
  revalidatePath("/quotes", "layout");
  revalidatePath(`/quotes/${id}`);
  revalidatePath("/crm", "layout");
  if ("error" in result) {
    return {
      error:
        quote.status === "DRAFT"
          ? `The quote is now marked as sent, but the email didn't go: ${result.error} Fix that and send it again from here.`
          : result.error,
    };
  }
  return { ok: sentTo(form.to) };
}

// ─── Payslips ──────────────────────────────────────────────────────────────

async function sendPayslip(payslipId: string, userId: string, settings: Awaited<ReturnType<typeof getSettings>>) {
  const p = await db.payslip.findUniqueOrThrow({
    where: { id: payslipId },
    include: { run: true, employee: { select: { firstName: true, workEmail: true } } },
  });
  const draft = payslipEmail({ firstName: p.employee.firstName, monthLabel: monthLabel(p.run.month), net: p.net, paidOn: p.run.paidOn }, settings);
  const pdf = (await payslipPdf(payslipId))!;
  return sendEmail({ kind: "PAYSLIP", to: [p.employee.workEmail], ...draft, attachments: [pdf], links: { payslipId } }, settings, userId);
}

async function finalisedRun(runId: string) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  return run.status === "DRAFT" ? null : run;
}

/** Email one person their payslip, to their work email. */
export async function emailPayslip(payslipId: string): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const ready = await readySettings();
  if ("error" in ready) return { error: ready.error };
  const slip = await db.payslip.findUniqueOrThrow({ where: { id: payslipId }, select: { runId: true } });
  const run = await finalisedRun(slip.runId);
  if (!run) return { error: "Finalize the payroll before emailing payslips." };
  const result = await sendPayslip(payslipId, user.id, ready.settings);
  revalidatePath(`/payroll/${run.month}`);
  return "error" in result ? { error: result.error } : { ok: "Sent." };
}

/** Email every payslip in a finalised month that hasn't gone out yet. */
export async function emailRunPayslips(runId: string): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const ready = await readySettings();
  if ("error" in ready) return { error: ready.error };
  const run = await finalisedRun(runId);
  if (!run) return { error: "Finalize the payroll before emailing payslips." };
  const waiting = await db.payslip.findMany({
    where: { runId, emails: { none: { status: "SENT" } } },
    select: { id: true, employee: { select: { firstName: true, lastName: true } } },
  });
  if (waiting.length === 0) return { ok: "Everyone already has this month's payslip." };
  const failed: string[] = [];
  for (const p of waiting) {
    const result = await sendPayslip(p.id, user.id, ready.settings);
    if ("error" in result) {
      failed.push(`${p.employee.firstName} ${p.employee.lastName}`.trim());
      // A wrong password or unreachable server fails every one the same way: stop and say why.
      if (failed.length === 1 && waiting.length > 1 && /password|reach/.test(result.error)) {
        revalidatePath(`/payroll/${run.month}`);
        return { error: result.error };
      }
    }
  }
  revalidatePath(`/payroll/${run.month}`);
  const sent = waiting.length - failed.length;
  if (failed.length) return { error: `Sent ${sent} of ${waiting.length}. Not sent to ${failed.join(", ")}: see the reason next to each name.` };
  return { ok: `Payslips sent to ${sent} ${sent === 1 ? "person" : "people"}.` };
}

// ─── Interviews ────────────────────────────────────────────────────────────

/** Invite a candidate to an interview, with a calendar invite attached. */
export async function emailInterviewInvite(interviewId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!canRecruit(user)) return { error: "Only managers and admins can invite candidates." };
  const ready = await readySettings();
  if ("error" in ready) return { error: ready.error };
  const form = readComposer(formData);
  if ("error" in form) return { error: form.error };
  const interview = await db.interview.findUnique({
    where: { id: interviewId },
    include: { candidate: { include: { job: { select: { title: true } } } }, interviewer: { select: { name: true } } },
  });
  if (!interview || interview.status !== "SCHEDULED") return { error: "Only a booked interview can be sent." };
  const ics = calendarInvite({
    uid: `interview-${interview.id}@edubotics-one`,
    start: interview.scheduledAt,
    minutes: 45,
    title: `${interview.round} interview: ${interview.candidate.job.title}, ${ready.settings.companyName}`,
    description: `${interview.mode} interview with ${interview.interviewer.name}.`,
    location: interview.location,
    organizer: { name: ready.settings.mailFromName || ready.settings.companyName, email: ready.settings.mailFromAddress! },
  });
  const result = await sendEmail(
    {
      kind: "INTERVIEW_INVITE",
      ...form,
      attachments: [{ filename: "interview.ics", content: Buffer.from(ics), contentType: "text/calendar; charset=utf-8; method=PUBLISH" }],
      links: { interviewId },
    },
    ready.settings,
    user.id,
  );
  revalidatePath(`/recruitment/candidates/${interview.candidateId}`);
  return "error" in result ? { error: result.error } : { ok: sentTo(form.to) };
}
