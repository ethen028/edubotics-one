import type { Invoice, InvoiceLine } from "@prisma/client";
import type { Settings } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { amountInWords, formatMoney } from "@/lib/invoices";

/** The invoice as the school sees it, on screen and on paper. */
export function InvoiceDocument({ invoice, lines, settings }: { invoice: Invoice; lines: InvoiceLine[]; settings: Settings }) {
  const interState = invoice.placeOfSupply !== settings.companyState;
  const taxed = lines.some((l) => Number(l.gstRate) > 0);
  const title = settings.gstEnabled && settings.gstin ? "Tax invoice" : "Invoice";
  const bank = [
    ["Account name", settings.bankAccountName],
    ["Bank", settings.bankName],
    ["Account no.", settings.bankAccountNo],
    ["IFSC", settings.bankIfsc],
    ["UPI", settings.upiId],
  ].filter(([, v]) => v);

  return (
    <article className="card relative mx-auto max-w-4xl text-sm print:border-0 print:p-0 print:shadow-none">
      {invoice.status !== "ISSUED" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="-rotate-12 text-7xl font-bold tracking-widest text-slate-200/70 uppercase">{invoice.status.toLowerCase()}</span>
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
            <dt>Invoice no.</dt>
            <dd className="font-medium text-slate-900">{invoice.number ?? "Given when issued"}</dd>
            <dt>Date</dt>
            <dd className="text-slate-900">{formatDate(invoice.issueDate)}</dd>
            <dt>Due by</dt>
            <dd className="text-slate-900">{formatDate(invoice.dueDate)}</dd>
          </dl>
        </div>
      </header>

      <section className="grid gap-4 border-b border-slate-200 py-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Bill to</div>
          <div className="mt-1 font-semibold">{invoice.billToName}</div>
          {invoice.billToAddress && <div className="whitespace-pre-line text-slate-600">{invoice.billToAddress}</div>}
          {invoice.billToGstin && <div className="mt-1">GSTIN: {invoice.billToGstin}</div>}
        </div>
        <div className="sm:text-right">
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Place of supply</div>
          <div className="mt-1">{invoice.placeOfSupply}</div>
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
            <div className="mt-0.5">{amountInWords(Number(invoice.total))}</div>
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
        <dl className="w-full max-w-xs space-y-1">
          <div className="flex justify-between">
            <dt className="text-slate-500">Taxable value</dt>
            <dd>{formatMoney(invoice.subtotal)}</dd>
          </div>
          {taxed &&
            (interState ? (
              <div className="flex justify-between">
                <dt className="text-slate-500">IGST</dt>
                <dd>{formatMoney(invoice.igst)}</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <dt className="text-slate-500">CGST</dt>
                  <dd>{formatMoney(invoice.cgst)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">SGST</dt>
                  <dd>{formatMoney(invoice.sgst)}</dd>
                </div>
              </>
            ))}
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatMoney(invoice.total)}</dd>
          </div>
        </dl>
      </section>

      {invoice.notes && <p className="mt-4 whitespace-pre-line text-slate-700">{invoice.notes}</p>}
      {settings.invoiceNote && <p className="mt-2 whitespace-pre-line text-slate-500">{settings.invoiceNote}</p>}
      <footer className="mt-8 flex items-end justify-between gap-4 text-xs text-slate-400">
        <span>This is a computer-generated invoice.</span>
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
