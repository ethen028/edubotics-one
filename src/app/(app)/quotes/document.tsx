import type { Quote, QuoteLine } from "@prisma/client";
import type { Settings } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { BillingDocument } from "../invoices/document";

const WATERMARK: Partial<Record<Quote["status"], string>> = { DRAFT: "draft", DECLINED: "declined", REVISED: "replaced" };

/** The quote as the school sees it, on screen and on paper. */
export function QuoteDocument({ quote, lines, settings }: { quote: Quote; lines: QuoteLine[]; settings: Settings }) {
  return (
    <BillingDocument
      doc={quote}
      lines={lines}
      settings={settings}
      title="Quotation"
      partyLabel="Quote for"
      watermark={WATERMARK[quote.status] ?? null}
      meta={[
        ["Quote no.", quote.number ?? "Given when sent"],
        ["Date", formatDate(quote.quoteDate)],
        ["Valid until", formatDate(quote.validUntil)],
      ]}
      footer="Prices are in Indian rupees. GST is charged as shown at the rate in force on the invoice date."
    >
      {quote.terms && (
        <div className="mt-4">
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Terms</div>
          <p className="mt-0.5 whitespace-pre-line text-slate-700">{quote.terms}</p>
        </div>
      )}
    </BillingDocument>
  );
}
