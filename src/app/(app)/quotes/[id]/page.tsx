import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, PageHeader } from "@/components/ui";
import { formatDate, toDateInput } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { formatMoney } from "@/lib/invoices";
import { quoteState, quoteStateColor, quoteStateLabel } from "@/lib/quotes";
import { PrintButton } from "../../payroll/payslip/[id]/print-button";
import { InvoiceForm } from "../../invoices/invoice-form";
import { QuoteDocument } from "../document";
import { quoteFormOptions } from "../data";
import { acceptQuote, declineQuote, deleteQuoteDraft, reopenQuote, reviseQuote, sendQuote, updateQuote } from "../actions";

export const metadata = { title: "Quote" };

export default async function QuotePage({ params }: PageProps<"/quotes/[id]">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const { id } = await params;
  const quote = await db.quote.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { position: "asc" } },
      organization: { select: { id: true, name: true } },
      contact: { select: { name: true, phone: true, email: true } },
      deal: { select: { id: true, title: true, stage: true } },
      revisionOf: { select: { id: true, number: true } },
      revisions: { select: { id: true, number: true, status: true }, orderBy: { createdAt: "asc" } },
      invoices: { select: { id: true, number: true, status: true, subtotal: true, total: true }, orderBy: { createdAt: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!quote) notFound();
  const settings = await getSettings();
  const isDraft = quote.status === "DRAFT";
  const options = isDraft ? await quoteFormOptions() : null;
  const today = todayIST();
  const state = quoteState(quote, today);
  const liveInvoices = quote.invoices.filter((i) => i.status !== "CANCELLED");
  const billed = liveInvoices.reduce((n, i) => n + Number(i.subtotal), 0);
  const left = Math.max(0, Number(quote.subtotal) - billed);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={quote.number ?? "Draft quote"}
          subtitle={
            <>
              <Badge color={quoteStateColor[state]}>{quoteStateLabel[state]}</Badge>{" "}
              <Link href={`/crm/organizations/${quote.organization.id}`} className="link">
                {quote.organization.name}
              </Link>
              {quote.deal && (
                <>
                  {" · deal "}
                  <Link href={`/crm/deals/${quote.deal.id}`} className="link">
                    {quote.deal.title}
                  </Link>
                </>
              )}
              {quote.revisionOf && (
                <>
                  {" · revises "}
                  <Link href={`/quotes/${quote.revisionOf.id}`} className="link">
                    {quote.revisionOf.number}
                  </Link>
                </>
              )}
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href="/quotes" className="btn-secondary">
                All quotes
              </Link>
              {isDraft && (
                <form action={deleteQuoteDraft.bind(null, quote.id)}>
                  <button className="btn-danger">Delete draft</button>
                </form>
              )}
              {(quote.status === "SENT" || quote.status === "DECLINED") && (
                <form action={reviseQuote.bind(null, quote.id)}>
                  <button className="btn-secondary">Revise</button>
                </form>
              )}
              <PrintButton />
            </div>
          }
        />
      </div>

      {isDraft && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm print:hidden">
          <span>
            Check the quote below, then mark it sent once you&apos;ve given it to the school. That gives it a number
            {quote.deal && ", moves the deal to Proposal and sets the deal value to this quote's amount before GST"}.
          </span>
          <form action={sendQuote.bind(null, quote.id)}>
            <button className="btn-primary">Mark as sent</button>
          </form>
        </div>
      )}
      {quote.status === "REVISED" && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm print:hidden">
          Replaced by{" "}
          {quote.revisions.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Link href={`/quotes/${r.id}`} className="link">
                {r.number ?? "a draft"}
              </Link>
            </span>
          ))}
          .
        </p>
      )}
      {quote.status === "DECLINED" && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm print:hidden">
          Declined on {formatDate(quote.decidedOn)}: “{quote.declineReason}”.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <QuoteDocument quote={quote} lines={quote.lines} settings={settings} />
          {isDraft && options && (
            <details className="print:hidden">
              <summary className="cursor-pointer text-sm font-medium text-brand-600">Edit draft</summary>
              <div className="mt-3">
                <InvoiceForm
                  kind="quote"
                  action={updateQuote.bind(null, quote.id)}
                  orgs={options.orgs}
                  contacts={options.contacts}
                  deals={options.deals}
                  projects={[]}
                  settings={options.settings}
                  defaults={{
                    organizationId: quote.organizationId,
                    contactId: quote.contactId,
                    dealId: quote.dealId,
                    billToName: quote.billToName,
                    billToAddress: quote.billToAddress,
                    billToGstin: quote.billToGstin,
                    placeOfSupply: quote.placeOfSupply,
                    terms: quote.terms,
                    notes: quote.notes,
                    issueDate: toDateInput(quote.quoteDate),
                    dueDate: toDateInput(quote.validUntil),
                    lines: quote.lines.map((l) => ({
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
          {quote.status === "SENT" && (
            <section className="card space-y-4">
              <div>
                <h2 className="font-semibold">Did the school accept?</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {state === "EXPIRED"
                    ? `It expired on ${formatDate(quote.validUntil)}. You can still record the answer, or revise it with new dates.`
                    : `Valid until ${formatDate(quote.validUntil)}.`}
                  {quote.contact &&
                    ` Ask ${quote.contact.name}${quote.contact.phone ? ` · ${quote.contact.phone}` : ""}${quote.contact.email ? ` · ${quote.contact.email}` : ""}.`}
                </p>
              </div>
              <ActionForm action={acceptQuote.bind(null, quote.id)} className="space-y-3">
                <Field label="Accepted on">
                  <input type="date" name="decidedOn" required defaultValue={toDateInput(today)} className="input" />
                </Field>
                <p className="text-xs text-slate-500">
                  {quote.deal
                    ? `The deal “${quote.deal.title}” becomes Won at ${formatMoney(quote.subtotal)} before GST, and you can invoice from here.`
                    : "You can invoice from here once it is accepted."}
                </p>
                <SubmitButton>Mark accepted</SubmitButton>
              </ActionForm>
              <details className="border-t border-slate-100 pt-3">
                <summary className="cursor-pointer text-sm font-medium text-red-700">The school declined</summary>
                <ActionForm action={declineQuote.bind(null, quote.id)} className="mt-3 space-y-3">
                  <Field label="Why">
                    <input name="reason" required className="input" placeholder="e.g. Budget cut, went with another vendor" />
                  </Field>
                  {quote.deal && quote.deal.stage !== "WON" && quote.deal.stage !== "LOST" && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="markLost" />
                      Also mark the deal as lost
                    </label>
                  )}
                  <SubmitButton className="btn-danger">Mark declined</SubmitButton>
                </ActionForm>
              </details>
            </section>
          )}

          {quote.status === "ACCEPTED" && (
            <section className="card space-y-3">
              <h2 className="font-semibold">Accepted on {formatDate(quote.decidedOn)}</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Invoiced (before GST)</div>
                  <div className="text-lg font-semibold">{formatMoney(billed)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Left to invoice</div>
                  <div className="text-lg font-semibold">{formatMoney(left)}</div>
                </div>
              </div>
              {left > 0 && (
                <Link href={`/invoices/new?quote=${quote.id}`} className="btn-primary w-full justify-center">
                  {liveInvoices.length === 0 ? "Create invoice from this quote" : "Invoice the rest"}
                </Link>
              )}
              {left > 0 && (
                <p className="text-xs text-slate-500">
                  The invoice starts as a draft with this quote&apos;s lines. Change the amounts there to bill an advance or an instalment.
                </p>
              )}
            </section>
          )}

          {quote.invoices.length > 0 && (
            <section className="card p-0">
              <h2 className="px-5 pt-4 pb-2 font-semibold">Invoices</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {quote.invoices.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 px-5 py-3">
                    <Link href={`/invoices/${i.id}`} className="link">
                      {i.number ?? "Draft invoice"}
                    </Link>
                    <span className={i.status === "CANCELLED" ? "text-slate-400 line-through" : ""}>{formatMoney(i.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(quote.status === "ACCEPTED" || quote.status === "DECLINED") && isAdmin(user) && liveInvoices.length === 0 && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-medium text-slate-600">Answer entered by mistake?</summary>
              <form action={reopenQuote.bind(null, quote.id)} className="mt-3 space-y-2">
                <p className="text-xs text-slate-500">This puts the quote back to waiting. The deal stays as it is now; change it on the deal if needed.</p>
                <button className="btn-secondary btn-sm">Put back to waiting</button>
              </form>
            </details>
          )}

          <p className="text-xs text-slate-400">
            Made by {quote.createdBy.name}
            {quote.sentAt && `, sent ${formatDate(quote.sentAt)}`}.
          </p>
        </aside>
      </div>
    </>
  );
}
