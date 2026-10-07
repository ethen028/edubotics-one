import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, Options, PageHeader } from "@/components/ui";
import { formatDate, toDateInput } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { PAYMENT_METHODS, formatMoney, methodLabel, payState, payStateColor, payStateLabel, settledAmount } from "@/lib/invoices";
import { PrintButton } from "../../payroll/payslip/[id]/print-button";
import { InvoiceDocument } from "../document";
import { InvoiceForm } from "../invoice-form";
import { invoiceFormOptions } from "../data";
import { cancelInvoice, deleteDraft, deletePayment, issueInvoice, recordPayment, updateInvoice } from "../actions";
import { emailInvoice } from "../../emails/actions";
import { EmailComposer, EmailHistory, emailLogSelect } from "@/components/email";
import { mailSetup } from "@/lib/mail";
import { invoiceEmail, reminderEmail } from "@/lib/email-templates";
import { creditReasonLabel, invoiceMoney } from "@/lib/credit-notes";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const { id } = await params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { position: "asc" } },
      payments: { include: { recordedBy: { select: { name: true } } }, orderBy: { receivedOn: "asc" } },
      creditNotes: { orderBy: [{ issueDate: "asc" }, { seq: "asc" }] },
      organization: { select: { id: true, name: true, email: true } },
      contact: { select: { name: true, phone: true, email: true } },
      emails: { select: emailLogSelect, orderBy: { createdAt: "desc" } },
      deal: { select: { id: true, title: true } },
      project: { select: { id: true, name: true } },
      workshop: { select: { id: true, title: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!invoice) notFound();
  const settings = await getSettings();
  const isDraft = invoice.status === "DRAFT";
  const options = isDraft ? await invoiceFormOptions() : null;
  const today = todayIST();
  const settled = settledAmount(invoice.payments);
  const money = invoiceMoney(invoice.total, settled, invoice.creditNotes);
  const balance = money.balance;
  const state = payState(invoice, settled, today, money.credited - money.refunded);
  const canCredit = invoice.status === "ISSUED" && money.credited < Number(invoice.total) - 0.005;
  const daysLate = Math.round((today.getTime() - invoice.dueDate.getTime()) / 86400000);
  const facts = { number: invoice.number ?? "", issueDate: invoice.issueDate, dueDate: invoice.dueDate, total: invoice.total, balance, daysLate };
  const reminding = state === "OVERDUE";
  const emailDraft = reminding
    ? reminderEmail([facts], invoice.contact?.name ?? null, user.name, settings)
    : invoiceEmail(facts, invoice.contact?.name ?? null, user.name, settings);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={invoice.number ?? "Draft invoice"}
          subtitle={
            <>
              <Badge color={payStateColor[state]}>{payStateLabel[state]}</Badge>{" "}
              <Link href={`/crm/organizations/${invoice.organization.id}`} className="link">
                {invoice.organization.name}
              </Link>
              {invoice.deal && (
                <>
                  {" · deal "}
                  <Link href={`/crm/deals/${invoice.deal.id}`} className="link">
                    {invoice.deal.title}
                  </Link>
                </>
              )}
              {invoice.project && (
                <>
                  {" · project "}
                  <Link href={`/projects/${invoice.project.id}`} className="link">
                    {invoice.project.name}
                  </Link>
                </>
              )}
              {invoice.workshop && (
                <>
                  {" · workshop "}
                  <Link href={`/workshops/${invoice.workshop.id}`} className="link">
                    {invoice.workshop.title}
                  </Link>
                </>
              )}
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href="/invoices" className="btn-secondary">
                All invoices
              </Link>
              {isDraft && (
                <form action={deleteDraft.bind(null, invoice.id)}>
                  <button className="btn-danger">Delete draft</button>
                </form>
              )}
              {!isDraft && (
                <a href={`/invoices/${invoice.id}/pdf`} target="_blank" className="btn-secondary">
                  PDF
                </a>
              )}
              {canCredit && (
                <Link href={`/credit-notes/new?invoice=${invoice.id}`} className="btn-secondary">
                  Raise a credit note
                </Link>
              )}
              <PrintButton />
            </div>
          }
        />
      </div>

      {isDraft && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm print:hidden">
          <span>
            Check the invoice below. Issuing gives it the next number in this financial year, and after that it can&apos;t be edited, only
            cancelled.
          </span>
          <form action={issueInvoice.bind(null, invoice.id)}>
            <button className="btn-primary">Issue invoice</button>
          </form>
        </div>
      )}
      {invoice.status === "CANCELLED" && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm print:hidden">
          Cancelled on {formatDate(invoice.cancelledAt)}: “{invoice.cancelReason}”. Its number stays used, as GST requires.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <InvoiceDocument invoice={invoice} lines={invoice.lines} settings={settings} />
          {isDraft && options && (
            <details className="print:hidden">
              <summary className="cursor-pointer text-sm font-medium text-brand-600">Edit draft</summary>
              <div className="mt-3">
                <InvoiceForm
                  action={updateInvoice.bind(null, invoice.id)}
                  orgs={options.orgs}
                  contacts={options.contacts}
                  deals={options.deals}
                  projects={options.projects}
                  settings={options.settings}
                  defaults={{
                    organizationId: invoice.organizationId,
                    contactId: invoice.contactId,
                    dealId: invoice.dealId,
                    projectId: invoice.projectId,
                    workshopId: invoice.workshopId,
                    billToName: invoice.billToName,
                    billToAddress: invoice.billToAddress,
                    billToGstin: invoice.billToGstin,
                    placeOfSupply: invoice.placeOfSupply,
                    notes: invoice.notes,
                    issueDate: toDateInput(invoice.issueDate),
                    dueDate: toDateInput(invoice.dueDate),
                    lines: invoice.lines.map((l) => ({
                      description: l.description,
                      sac: l.sac ?? "",
                      quantity: String(Number(l.quantity)),
                      unitPrice: String(Number(l.unitPrice)),
                      gstRate: String(Number(l.gstRate)),
                    })),
                  }}
                  submitLabel="Save draft"
                />
              </div>
            </details>
          )}
        </div>

        <aside className="space-y-6 print:hidden">
          {invoice.status === "ISSUED" && (
            <section className="card space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Received</div>
                  <div className="text-lg font-semibold">{formatMoney(settled)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Still due</div>
                  <div className={`text-lg font-semibold ${state === "OVERDUE" ? "text-red-600" : ""}`}>
                    {formatMoney(Math.max(0, balance))}
                  </div>
                </div>
                {money.credited > 0 && (
                  <div>
                    <div className="text-xs text-slate-500">Credit notes</div>
                    <div className="text-lg font-semibold">{formatMoney(money.credited)}</div>
                  </div>
                )}
                {money.owedBack > 0 && (
                  <div>
                    <div className="text-xs text-slate-500">To refund</div>
                    <div className="text-lg font-semibold text-purple-700">{formatMoney(money.owedBack)}</div>
                  </div>
                )}
              </div>
              {invoice.contact && (
                <p className="text-xs text-slate-500">
                  Ask {invoice.contact.name}
                  {invoice.contact.phone && ` · ${invoice.contact.phone}`}
                  {invoice.contact.email && ` · ${invoice.contact.email}`}
                </p>
              )}
            </section>
          )}

          {invoice.status === "ISSUED" && (balance > 0 || invoice.emails.length === 0) && (
            <EmailComposer
              title={reminding ? "Send a payment reminder" : "Email this invoice"}
              action={emailInvoice.bind(null, invoice.id)}
              hidden={{ kind: reminding ? "PAYMENT_REMINDER" : "INVOICE" }}
              draft={{ to: invoice.contact?.email ?? invoice.organization.email ?? "", ...emailDraft }}
              attachments={[`Invoice ${invoice.number?.replace(/\//g, "-")}.pdf`]}
              setup={mailSetup(settings)}
              admin={isAdmin(user)}
              submitLabel={reminding ? "Send reminder" : "Send invoice"}
            />
          )}

          <EmailHistory emails={invoice.emails} />

          {invoice.creditNotes.length > 0 && (
            <section className="card p-0">
              <h2 className="px-5 pt-4 pb-2 font-semibold">Credit notes</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {invoice.creditNotes.map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div>
                      <Link href={`/credit-notes/${n.id}`} className="link font-medium">
                        {n.number}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {formatDate(n.issueDate)} · {creditReasonLabel[n.reason]}
                      </div>
                      {n.status === "CANCELLED" && <div className="text-xs text-slate-400">Cancelled</div>}
                    </div>
                    <div className={`font-medium whitespace-nowrap ${n.status === "CANCELLED" ? "text-slate-400 line-through" : ""}`}>
                      − {formatMoney(n.total)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {invoice.payments.length > 0 && (
            <section className="card p-0">
              <h2 className="px-5 pt-4 pb-2 font-semibold">Payments</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div>
                      <div className="font-medium">{formatMoney(p.amount)}</div>
                      <div className="text-xs text-slate-500">
                        {formatDate(p.receivedOn)} · {methodLabel[p.method]}
                        {p.reference && ` · ${p.reference}`}
                      </div>
                      {Number(p.tds) > 0 && <div className="text-xs text-slate-500">+ {formatMoney(p.tds)} TDS withheld</div>}
                      {p.note && <div className="text-xs text-slate-500">{p.note}</div>}
                      <div className="text-xs text-slate-400">Recorded by {p.recordedBy.name}</div>
                    </div>
                    {isAdmin(user) && (
                      <form action={deletePayment.bind(null, p.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {invoice.status === "ISSUED" && balance > 0 && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Record a payment</h2>
              <ActionForm action={recordPayment.bind(null, invoice.id)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Received on">
                    <input type="date" name="receivedOn" required defaultValue={toDateInput(today)} className="input" />
                  </Field>
                  <Field label="How">
                    <select name="method" className="input">
                      <Options values={PAYMENT_METHODS} labels={(m) => methodLabel[m as keyof typeof methodLabel]} />
                    </select>
                  </Field>
                  <Field label="Amount received (₹)">
                    <input type="number" name="amount" min="0" step="0.01" required defaultValue={balance.toFixed(2)} className="input" />
                  </Field>
                  <Field label="TDS withheld (₹)">
                    <input type="number" name="tds" min="0" step="0.01" placeholder="0" className="input" />
                  </Field>
                </div>
                <Field label="Reference">
                  <input name="reference" className="input" placeholder="UTR, UPI ref or cheque no." />
                </Field>
                <Field label="Note">
                  <input name="note" className="input" />
                </Field>
                <SubmitButton>Record payment</SubmitButton>
              </ActionForm>
            </section>
          )}

          {invoice.status === "ISSUED" && isAdmin(user) && invoice.payments.length === 0 && money.credited === 0 && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-medium text-red-700">Cancel this invoice</summary>
              <p className="mt-2 text-xs text-slate-500">
                Only for an invoice raised by mistake. If the school already has it, or it&apos;s in a GST return, raise a credit note instead.
              </p>
              <ActionForm action={cancelInvoice.bind(null, invoice.id)} className="mt-3 space-y-3">
                <Field label="Why">
                  <input name="reason" required className="input" placeholder="e.g. Wrong amount, reissued as a new invoice" />
                </Field>
                <SubmitButton className="btn-danger">Cancel invoice</SubmitButton>
              </ActionForm>
            </details>
          )}

          <p className="text-xs text-slate-400">
            Made by {invoice.createdBy.name}
            {invoice.issuedAt && `, issued ${formatDate(invoice.issuedAt)}`}.
          </p>
        </aside>
      </div>
    </>
  );
}
