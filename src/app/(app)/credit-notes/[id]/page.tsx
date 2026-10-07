import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, Options, PageHeader } from "@/components/ui";
import { formatDate, toDateInput } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { PAYMENT_METHODS, formatMoney, methodLabel } from "@/lib/invoices";
import { creditNoteNotes, gstCreditDeadline } from "@/lib/credit-notes";
import { PrintButton } from "../../payroll/payslip/[id]/print-button";
import { BillingDocument } from "../../invoices/document";
import { cancelCreditNote, recordRefund, removeRefund } from "../actions";
import { invoiceForCredit } from "../data";
import { emailCreditNote } from "../../emails/actions";
import { EmailComposer, EmailHistory, emailLogSelect } from "@/components/email";
import { mailSetup } from "@/lib/mail";
import { creditNoteEmail } from "@/lib/email-templates";

export const metadata = { title: "Credit note" };

export default async function CreditNotePage({ params }: PageProps<"/credit-notes/[id]">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const { id } = await params;
  const note = await db.creditNote.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { position: "asc" } },
      emails: { select: emailLogSelect, orderBy: { createdAt: "desc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!note) notFound();
  const [ctx, settings] = await Promise.all([invoiceForCredit(note.invoiceId), getSettings()]);
  const { invoice } = ctx!;
  const live = note.status === "ISSUED";
  const lateForGst = note.issueDate > gstCreditDeadline(invoice.issueDate);
  const refundable = Math.min(Number(note.total), ctx!.owedBack);
  const draft = creditNoteEmail(
    { number: note.number, issueDate: note.issueDate, total: note.total, invoiceNumber: invoice.number ?? "", balance: ctx!.balance, owedBack: ctx!.owedBack },
    invoice.contact?.name ?? null,
    user.name,
    settings,
  );

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={note.number}
          subtitle={
            <>
              <Badge color={live ? "purple" : "gray"}>{live ? "Credit note" : "Cancelled"}</Badge> against invoice{" "}
              <Link href={`/invoices/${invoice.id}`} className="link">
                {invoice.number}
              </Link>
              {" · "}
              <Link href={`/crm/organizations/${invoice.organization.id}`} className="link">
                {invoice.organization.name}
              </Link>
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href="/credit-notes" className="btn-secondary">
                All credit notes
              </Link>
              <a href={`/credit-notes/${note.id}/pdf`} target="_blank" className="btn-secondary">
                PDF
              </a>
              <PrintButton />
            </div>
          }
        />
      </div>

      {!live && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm print:hidden">
          Cancelled on {formatDate(note.cancelledAt)}: “{note.cancelReason}”. Its number stays used, and the invoice is back to what it was.
        </p>
      )}
      {live && lateForGst && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm print:hidden">
          Dated after the GST deadline for this invoice ({formatDate(gstCreditDeadline(invoice.issueDate))}), so it lowers what the school owes but
          not the GST already declared.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <BillingDocument
            doc={{ ...invoice, ...note, notes: creditNoteNotes(note) }}
            lines={note.lines}
            settings={settings}
            title="Credit note"
            partyLabel="Issued to"
            watermark={live ? null : "cancelled"}
            meta={[
              ["Credit note no.", note.number],
              ["Date", formatDate(note.issueDate)],
              ["Against invoice", invoice.number ?? ""],
              ["Invoice date", formatDate(invoice.issueDate)],
            ]}
            footer="This is a computer-generated credit note."
          />
        </div>

        <aside className="space-y-6 print:hidden">
          <section className="card space-y-2 text-sm">
            <h2 className="font-semibold">Invoice {invoice.number} now</h2>
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt className="text-slate-500">Invoiced</dt>
                <dd>{formatMoney(invoice.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Credit notes</dt>
                <dd>− {formatMoney(ctx!.credited)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Received + TDS</dt>
                <dd>− {formatMoney(ctx!.settled)}</dd>
              </div>
              {ctx!.refunded > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Refunded to the school</dt>
                  <dd>+ {formatMoney(ctx!.refunded)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                <dt>{ctx!.owedBack > 0 ? "To refund to the school" : "Still due"}</dt>
                <dd className={ctx!.owedBack > 0 ? "text-purple-700" : ""}>{formatMoney(ctx!.owedBack > 0 ? ctx!.owedBack : ctx!.balance)}</dd>
              </div>
            </dl>
          </section>

          {live && (
            <EmailComposer
              title="Email this credit note"
              action={emailCreditNote.bind(null, note.id)}
              draft={{ to: invoice.contact?.email ?? invoice.organization.email ?? "", ...draft }}
              attachments={[`Credit note ${note.number.replace(/\//g, "-")}.pdf`]}
              setup={mailSetup(settings)}
              admin={isAdmin(user)}
              submitLabel="Send credit note"
            />
          )}
          <EmailHistory emails={note.emails} />

          {Number(note.refundAmount) > 0 && (
            <section className="card space-y-1 text-sm">
              <h2 className="font-semibold">Refund</h2>
              <p>
                {formatMoney(note.refundAmount)} paid back on {formatDate(note.refundedOn)}
                {note.refundMethod && ` · ${methodLabel[note.refundMethod]}`}
                {note.refundReference && ` · ${note.refundReference}`}
              </p>
              {isAdmin(user) && (
                <form action={removeRefund.bind(null, note.id)}>
                  <button className="text-xs text-slate-400 hover:text-red-600">Remove refund</button>
                </form>
              )}
            </section>
          )}

          {live && isAdmin(user) && Number(note.refundAmount) === 0 && refundable > 0 && (
            <section className="card">
              <h2 className="mb-1 font-semibold">Record a refund</h2>
              <p className="mb-3 text-xs text-slate-500">The school paid more than the invoice is now worth. Record the money once it is paid back.</p>
              <ActionForm action={recordRefund.bind(null, note.id)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Paid back on">
                    <input type="date" name="refundedOn" required defaultValue={toDateInput(todayIST())} className="input" />
                  </Field>
                  <Field label="How">
                    <select name="refundMethod" className="input">
                      <Options values={PAYMENT_METHODS} labels={(m) => methodLabel[m as keyof typeof methodLabel]} />
                    </select>
                  </Field>
                </div>
                <Field label="Amount (₹)">
                  <input
                    type="number"
                    name="refundAmount"
                    min="0"
                    step="0.01"
                    max={refundable.toFixed(2)}
                    required
                    defaultValue={refundable.toFixed(2)}
                    className="input"
                  />
                </Field>
                <Field label="Reference">
                  <input name="refundReference" className="input" placeholder="UTR, UPI ref or cheque no." />
                </Field>
                <SubmitButton>Record refund</SubmitButton>
              </ActionForm>
            </section>
          )}

          {live && isAdmin(user) && Number(note.refundAmount) === 0 && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-medium text-red-700">Cancel this credit note</summary>
              <ActionForm action={cancelCreditNote.bind(null, note.id)} className="mt-3 space-y-3">
                <Field label="Why">
                  <input name="reason" required className="input" placeholder="e.g. Raised on the wrong invoice" />
                </Field>
                <SubmitButton className="btn-danger">Cancel credit note</SubmitButton>
              </ActionForm>
            </details>
          )}

          <p className="text-xs text-slate-400">
            Raised by {note.createdBy.name} on {formatDate(note.createdAt)}.
          </p>
        </aside>
      </div>
    </>
  );
}
