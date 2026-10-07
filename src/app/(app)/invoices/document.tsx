import type { ReactNode } from "react";
import type { Invoice, InvoiceLine } from "@prisma/client";
import type { Settings } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { amountInWords, formatMoney } from "@/lib/invoices";

/** The invoice as the school sees it, on screen and on paper. */
export function InvoiceDocument({ invoice, lines, settings }: { invoice: Invoice; lines: InvoiceLine[]; settings: Settings }) {
  return (
    <BillingDocument
      doc={invoice}
      lines={lines}
      settings={settings}
      title={settings.gstEnabled && settings.gstin ? "Tax invoice" : "Invoice"}
      partyLabel="Bill to"
      watermark={invoice.status !== "ISSUED" ? invoice.status.toLowerCase() : null}
      meta={[
        ["Invoice no.", invoice.number ?? "Given when issued"],
        ["Date", formatDate(invoice.issueDate)],
        ["Due by", formatDate(invoice.dueDate)],
      ]}
      paymentDetails
      footer="This is a computer-generated invoice."
    />
  );
}

type Amounts = { placeOfSupply: string; billToName: string; billToAddress: string | null; billToGstin: string | null; notes: string | null };
type Money = { toString(): string };
type DocLine = { id: string; description: string; sac: string | null; quantity: Money; unitPrice: Money; gstRate: Money; amount: Money };

/** Company header, party, lines and GST totals: the layout invoices and quotes share. */
export function BillingDocument({
  doc,
  lines,
  settings,
  title,
  partyLabel,
  watermark,
  meta,
  paymentDetails = false,
  children,
  footer,
}: {
  doc: Amounts & { subtotal: Money; cgst: Money; sgst: Money; igst: Money; total: Money };
  lines: DocLine[];
  settings: Settings;
  title: string;
  partyLabel: string;
  watermark: string | null;
  meta: [string, string][];
  paymentDetails?: boolean;
  children?: ReactNode;
  footer: string;
}) {
  const interState = doc.placeOfSupply !== settings.companyState;
  const taxed = lines.some((l) => Number(l.gstRate) > 0);
  const bank = [
    ["Account name", settings.bankAccountName],
    ["Bank", settings.bankName],
    ["Account no.", settings.bankAccountNo],
    ["IFSC", settings.bankIfsc],
    ["UPI", settings.upiId],
  ].filter(([, v]) => v && paymentDetails);

  return (
    <article className="card relative mx-auto max-w-4xl text-sm print:border-0 print:p-0 print:shadow-none">
      {watermark && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="-rotate-12 text-7xl font-bold tracking-widest text-slate-200/70 uppercase">{watermark}</span>
        </div>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="font-display text-lg font-semibold">{settings.companyName}</div>
          <div className="whitespace-pre-line text-slate-600">{settings.companyAddress}</div>
          {(settings.companyPhone || settings.companyEmail) && (
            <div className="text-slate-600">{[settings.companyPhone, settings.companyEmail].filter(Boolean).join(" · ")}</div>
          )}
          {settings.gstin && <div className="mt-1">GSTIN: {settings.gstin}</div>}
          {settings.pan && <div>PAN: {settings.pan}</div>}
        </div>
        <div className="text-right">
          <div className="font-display text-xl font-semibold text-brand-700 uppercase">{title}</div>
          <dl className="mt-1 grid grid-cols-[auto_auto] justify-end gap-x-3 text-slate-600">
            {meta.map(([k, v], i) => (
              <div key={k} className="contents">
                <dt>{k}</dt>
                <dd className={i === 0 ? "font-medium text-slate-900" : "text-slate-900"}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <section className="grid gap-4 border-b border-slate-200 py-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{partyLabel}</div>
          <div className="mt-1 font-semibold">{doc.billToName}</div>
          {doc.billToAddress && <div className="whitespace-pre-line text-slate-600">{doc.billToAddress}</div>}
          {doc.billToGstin && <div className="mt-1">GSTIN: {doc.billToGstin}</div>}
        </div>
        <div className="sm:text-right">
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Place of supply</div>
          <div className="mt-1">{doc.placeOfSupply}</div>
        </div>
      </section>

      <div className="overflow-x-auto">
        <table className="table mt-2">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Description</th>
              <th>SAC/HSN</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Rate</th>
              {taxed && <th className="text-right">GST</th>}
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td className="min-w-48 whitespace-pre-line">{l.description}</td>
                <td>{l.sac ?? "—"}</td>
                <td className="text-right">{Number(l.quantity)}</td>
                <td className="text-right whitespace-nowrap">{formatMoney(l.unitPrice)}</td>
                {taxed && <td className="text-right">{Number(l.gstRate)}%</td>}
                <td className="text-right whitespace-nowrap">{formatMoney(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-4 flex flex-wrap justify-between gap-6">
        <div className="max-w-sm space-y-3">
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Amount in words</div>
            <div className="mt-0.5">{amountInWords(Number(doc.total))}</div>
          </div>
          {bank.length > 0 && (
            <div>
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Pay to</div>
              <dl className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-3">
                {bank.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-slate-500">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
        <dl className="ml-auto w-full max-w-xs space-y-1">
          <div className="flex justify-between">
            <dt className="text-slate-500">Taxable value</dt>
            <dd>{formatMoney(doc.subtotal)}</dd>
          </div>
          {taxed &&
            (interState ? (
              <div className="flex justify-between">
                <dt className="text-slate-500">IGST</dt>
                <dd>{formatMoney(doc.igst)}</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <dt className="text-slate-500">CGST</dt>
                  <dd>{formatMoney(doc.cgst)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">SGST</dt>
                  <dd>{formatMoney(doc.sgst)}</dd>
                </div>
              </>
            ))}
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatMoney(doc.total)}</dd>
          </div>
        </dl>
      </section>

      {children}
      {doc.notes && <p className="mt-4 whitespace-pre-line text-slate-700">{doc.notes}</p>}
      {paymentDetails && settings.invoiceNote && <p className="mt-2 whitespace-pre-line text-slate-500">{settings.invoiceNote}</p>}
      <footer className="mt-8 flex items-end justify-between gap-4 text-xs text-slate-400">
        <span>{footer}</span>
        <span className="text-right text-slate-600">
          For {settings.companyName}
          <br />
          <br />
          Authorised signatory
        </span>
      </footer>
    </article>
  );
}
